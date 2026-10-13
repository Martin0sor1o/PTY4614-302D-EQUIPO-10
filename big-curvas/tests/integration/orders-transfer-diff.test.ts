import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { adjustStock, receiveStock, sendTransferCommand } from "@/modules/inventory";
import { fillShortage, getOrderDetail, prepareOrder, receiveTransferAndSync, resolveTransferAndSync } from "@/modules/orders";
import { expectAppError, expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";
import { allInStore, confirmTestPayment, orderTransfers, prepareTestOrder, registerTestOrder } from "./orders-helpers";

// Traslado de un pedido que llega con diferencia (RN-30): el pedido queda bloqueado en ESPERANDO_TRASPASO hasta
// que Belén resuelve, y lo que pasa después depende de la resolución.

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const CPU_2XL = "CPU053-NEG-2XL"; // Rancagua 3 · Bodega 0
const PBA_XL = "PBA041-NEG-XL"; // Rancagua 5 · Bodega 20 (los tests la bajan a 1)

const belen = () => f.actors.belen;
const detail = (orderId: string) => getOrderDetail({ actor: belen(), orderId });

/** Pedido apartado en la tienda y ya ENVIADO por la vendedora. */
async function sentOrder(sku: string, qty: number) {
  const order = await registerTestOrder(f, [{ sku, qty }]);
  await confirmTestPayment(f, order.id, undefined, undefined, allInStore(f, order));
  const [transfer] = await orderTransfers(order.id);
  await sendTransferCommand({ actor: f.actors.vendRga, transferId: transfer.id, idempotencyKey: newKey("enviar") });
  return { order, transferId: transfer.id, variantId: await f.variant(sku), lineId: transfer.lines[0].id };
}

const receive = (transferId: string, variantId: string, qty: number) =>
  receiveTransferAndSync({ actor: belen(), transferId, lines: [{ variantId, qty }], idempotencyKey: newKey("recibir") });

const resolve = (transferId: string, lineId: string, resolution: "MERMA" | "REENVIO" | "ERROR_ENVIO") =>
  resolveTransferAndSync({ actor: belen(), transferId, resolutions: [{ lineId, resolution }], idempotencyKey: newKey("resolver") });

describe("traslado del pedido con diferencia", () => {
  it("queda bloqueado en ESPERANDO_TRASPASO con aviso y no se puede preparar ni completar", async () => {
    const { order, transferId, variantId } = await sentOrder(CPU_2XL, 3);
    await receive(transferId, variantId, 2);

    const blocked = await detail(order.id);
    expect(blocked.status).toBe("ESPERANDO_TRASPASO");
    expect(blocked.blockedByTransferDifference).toBe(true);
    expect(blocked.canFillShortage).toBe(false);
    expect(blocked.transfers.map((t) => t.status)).toEqual(["RECIBIDO_CON_DIFERENCIAS"]);
    expect(blocked.events.at(-1)?.note).toMatch(/recibido con diferencias.*bloqueado/);
    // Lo recibido (2) ya está reservado para el pedido en bodega; falta 1.
    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 2 });
    expect(blocked.lines[0]).toMatchObject({ inTransit: 0, shortage: 1 });

    await expectAppError(fillShortage({ actor: belen(), orderId: order.id, idempotencyKey: newKey("fill") }), "CONFLICT", /traslado con diferencias/);
    await expectAppError(
      prepareOrder({ actor: belen(), orderId: order.id, scanned: [{ variantId, qty: 3 }], idempotencyKey: newKey("pick") }),
      "CONFLICT",
      /esperando traslado/,
    );
    await expectInvariants();
  });

  it("REENVIO: vuelve a apartar lo que se quedó en la tienda y el reenvío viaja ligado al pedido", async () => {
    const { order, transferId, variantId, lineId } = await sentOrder(CPU_2XL, 3);
    await receive(transferId, variantId, 2);

    const { result } = await resolve(transferId, lineId, "REENVIO");

    // La unidad que no viajó (+1 en la tienda) se aparta de nuevo para este pedido.
    expect(await stockOf(variantId, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 1 });
    const reship = result.reshipTransfer!;
    const [, linkedReship] = await orderTransfers(order.id);
    expect(linkedReship.id).toBe(reship.id);
    expect(linkedReship).toMatchObject({ status: "BORRADOR", reason: "PEDIDO_ONLINE", onlineOrderId: order.id });
    expect(linkedReship.lines[0]).toMatchObject({ qtySent: 1, orderLineId: order.lines[0].id });
    expect(linkedReship.lines[0].reservationId).not.toBeNull();

    const waiting = await detail(order.id);
    expect(waiting.status).toBe("ESPERANDO_TRASPASO");
    expect(waiting.blockedByTransferDifference).toBe(false);
    expect(waiting.lines[0].shortage).toBe(0);
    expect(waiting.events.at(-1)?.note).toMatch(/reenvío TR-000002/);

    // El reenvío sale y llega completo: la reserva viaja y el pedido queda listo.
    await sendTransferCommand({ actor: f.actors.vendRga, transferId: reship.id, idempotencyKey: newKey("enviar") });
    await receive(reship.id, variantId, 1);
    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual({ onHand: 3, reserved: 3 });
    const ready = await detail(order.id);
    expect(ready.status).toBe("LISTO_PARA_PREPARAR");

    await prepareTestOrder(f, ready);
    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual({ onHand: 0, reserved: 0 });
    expect(await stockOf(variantId, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 0, reserved: 0 });
    await expectInvariants();
  });

  it("MERMA: no mueve stock y el pedido queda con un faltante que se completa desde bodega", async () => {
    const pba = await f.variant(PBA_XL);
    await adjustStock({ actor: belen(), locationId: f.loc.BODEGA, variantId: pba, delta: -19, reason: "Prueba: bodega casi vacía", idempotencyKey: newKey("aj") });
    const { order, transferId, lineId } = await sentOrder(PBA_XL, 3); // 3 desde la tienda (bodega tiene 1)
    await receive(transferId, pba, 2);
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 3, reserved: 2 });

    await resolve(transferId, lineId, "MERMA");

    // Sin cambios de stock (se perdió en el camino) y el traslado se cierra.
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 3, reserved: 2 });
    expect(await stockOf(pba, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 2, reserved: 0 });
    const short = await detail(order.id);
    expect(short).toMatchObject({ status: "ESPERANDO_TRASPASO", blockedByTransferDifference: false, canFillShortage: true });
    expect(short.lines[0].shortage).toBe(1);
    expect(short.transfers.map((t) => t.status)).toEqual(["CERRADO"]);
    expect(short.events.at(-1)?.note).toMatch(/faltan 1 unidad/);

    // Completar el faltante: la bodega tiene 1 disponible → se aparta ahí y el pedido queda listo.
    const filled = await fillShortage({ actor: belen(), orderId: order.id, idempotencyKey: newKey("fill") });
    expect(filled.result.status).toBe("LISTO_PARA_PREPARAR");
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 3, reserved: 3 });
    expect(await db.transfer.count({ where: { onlineOrderId: order.id } })).toBe(1); // no hizo falta otro traslado

    await prepareTestOrder(f, filled.result);
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 0, reserved: 0 });
    await expectInvariants();
  });

  it("MERMA + completar faltante desde la tienda: nuevo traslado ligado al pedido", async () => {
    const { order, transferId, variantId, lineId } = await sentOrder(CPU_2XL, 3);
    await receive(transferId, variantId, 2);
    await resolve(transferId, lineId, "MERMA");
    expect(await stockOf(variantId, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 0, reserved: 0 });

    // Sin disponible en ninguna parte: no se puede completar.
    await expectAppError(
      fillShortage({
        actor: belen(),
        orderId: order.id,
        lineSources: [{ lineId: order.lines[0].id, locationId: f.loc.TIENDA_RANCAGUA }],
        idempotencyKey: newKey("fill"),
      }),
      "STOCK_INSUFICIENTE",
      /Tienda Rancagua/,
    );
    expect((await detail(order.id)).lines[0].shortage).toBe(1);

    // Llega mercadería a la tienda y ahora sí.
    await receiveStock({ actor: belen(), locationId: f.loc.TIENDA_RANCAGUA, lines: [{ variantId, qty: 2 }], idempotencyKey: newKey("prov") });
    const key = newKey("fill");
    const sources = [{ lineId: order.lines[0].id, locationId: f.loc.TIENDA_RANCAGUA }];
    const filled = await fillShortage({ actor: belen(), orderId: order.id, lineSources: sources, idempotencyKey: key });
    const replay = await fillShortage({ actor: belen(), orderId: order.id, lineSources: sources, idempotencyKey: key });
    expect(replay.replayed).toBe(true);
    expect(filled.result.status).toBe("ESPERANDO_TRASPASO");
    expect(filled.result.lines[0].shortage).toBe(0);
    expect(await stockOf(variantId, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 2, reserved: 1 });

    const transfers = await orderTransfers(order.id);
    expect(transfers).toHaveLength(2);
    expect(transfers[1]).toMatchObject({ status: "BORRADOR", reason: "PEDIDO_ONLINE", onlineOrderId: order.id });
    expect(transfers[1].lines[0]).toMatchObject({ qtySent: 1, orderLineId: order.lines[0].id });

    await sendTransferCommand({ actor: f.actors.vendRga, transferId: transfers[1].id, idempotencyKey: newKey("enviar") });
    await receive(transfers[1].id, variantId, 1);
    const ready = await detail(order.id);
    expect(ready.status).toBe("LISTO_PARA_PREPARAR");
    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual({ onHand: 3, reserved: 3 });
    await prepareTestOrder(f, ready);
    await expectInvariants();
  });

  it("ERROR_ENVIO (faltante): la unidad vuelve libre a la tienda y el pedido queda con faltante", async () => {
    const { order, transferId, variantId, lineId } = await sentOrder(CPU_2XL, 3);
    await receive(transferId, variantId, 2);

    await resolve(transferId, lineId, "ERROR_ENVIO");

    expect(await stockOf(variantId, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 0 }); // libre, sin apartar
    const short = await detail(order.id);
    expect(short).toMatchObject({ status: "ESPERANDO_TRASPASO", canFillShortage: true });
    expect(short.lines[0].shortage).toBe(1);
    expect(await db.transfer.count({ where: { onlineOrderId: order.id } })).toBe(1);
    await expectInvariants();
  });

  it("sobrante + ERROR_ENVIO: se desbloquea y, con todo reservado en bodega, queda LISTO_PARA_PREPARAR", async () => {
    const { order, transferId, variantId, lineId } = await sentOrder(CPU_2XL, 2); // la tienda conserva 1
    await receive(transferId, variantId, 3); // llegó 1 de más

    const blocked = await detail(order.id);
    expect(blocked.status).toBe("ESPERANDO_TRASPASO");
    expect(blocked.blockedByTransferDifference).toBe(true);
    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual({ onHand: 3, reserved: 2 }); // solo se reserva lo del pedido

    await resolve(transferId, lineId, "ERROR_ENVIO");

    expect(await stockOf(variantId, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 0, reserved: 0 }); // salió 1 más de lo anotado
    const ready = await detail(order.id);
    expect(ready.status).toBe("LISTO_PARA_PREPARAR");
    await prepareTestOrder(f, ready);
    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual({ onHand: 1, reserved: 0 }); // la unidad de más queda libre
    await expectInvariants();
  });

  it("resolver es idempotente y no avanza el pedido dos veces", async () => {
    const { order, transferId, variantId, lineId } = await sentOrder(CPU_2XL, 3);
    await receive(transferId, variantId, 2);
    const key = newKey("resolver");
    const input = { actor: belen(), transferId, resolutions: [{ lineId, resolution: "REENVIO" as const }], idempotencyKey: key };

    const first = await resolveTransferAndSync(input);
    const second = await resolveTransferAndSync(input);

    expect(second.replayed).toBe(true);
    expect(second.result.reshipTransfer?.id).toBe(first.result.reshipTransfer?.id);
    expect(await db.transfer.count({ where: { onlineOrderId: order.id } })).toBe(2);
    expect(await stockOf(variantId, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 1 });
    await expectInvariants();
  });
});
