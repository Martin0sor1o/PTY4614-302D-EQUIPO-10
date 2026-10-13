import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { sendTransferCommand } from "@/modules/inventory";
import { cancelOrder, getOrderDetail, receiveTransferAndSync, resolveTransferAndSync } from "@/modules/orders";
import { expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";
import { allInStore, confirmTestPayment, orderTransfers, registerTestOrder } from "./orders-helpers";

// Cancelar un pedido en ESPERANDO_TRASPASO (docs/02 RF-PED-09): libera las reservas; si el traslado ya viaja, al
// llegar a bodega la prenda queda como stock libre. La Sale queda intacta con "reembolso pendiente".

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const CPU_2XL = "CPU053-NEG-2XL"; // Rancagua 3 · Bodega 0

const cancel = (orderId: string, key = newKey("cancelar")) =>
  cancelOrder({ actor: f.actors.belen, orderId, reason: "La clienta se arrepintió", idempotencyKey: key });
const send = (transferId: string) => sendTransferCommand({ actor: f.actors.vendRga, transferId, idempotencyKey: newKey("enviar") });
const receive = (transferId: string, variantId: string, qty: number) =>
  receiveTransferAndSync({ actor: f.actors.belen, transferId, lines: [{ variantId, qty }], idempotencyKey: newKey("recibir") });

async function pendingTransferOrder(qty = 2) {
  const order = await registerTestOrder(f, [{ sku: CPU_2XL, qty }]);
  await confirmTestPayment(f, order.id, undefined, undefined, allInStore(f, order));
  const [transfer] = await orderTransfers(order.id);
  return { order, transfer, variantId: await f.variant(CPU_2XL) };
}

describe("cancelar en ESPERANDO_TRASPASO", () => {
  it("con el traslado en BORRADOR: libera la reserva de la tienda y anula el traslado", async () => {
    const { order, variantId } = await pendingTransferOrder();
    const movements = await db.inventoryMovement.count();

    const { result } = await cancel(order.id);

    expect(result.status).toBe("CANCELADO");
    expect(result.refundPending).toBe(true);
    expect(result.transfers.map((t) => t.status)).toEqual(["ANULADO"]);
    expect(await stockOf(variantId, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 3, reserved: 0 });
    expect((await db.reservation.findMany()).map((r) => r.status)).toEqual(["LIBERADA"]);
    expect(await db.inventoryMovement.count()).toBe(movements);
    expect((await db.sale.findFirstOrThrow()).status).toBe("COMPLETADA"); // la venta queda intacta (regla 10b)
    expect(await db.auditLog.count({ where: { action: "TRANSFER_CANCEL", entity: "transfer" } })).toBe(1);
    await expectInvariants();
  });

  it("con el traslado EN_TRANSITO: al llegar a bodega la prenda queda como stock LIBRE", async () => {
    const { order, transfer, variantId } = await pendingTransferOrder();
    await send(transfer.id);

    await cancel(order.id);

    const [t] = await orderTransfers(order.id);
    expect(t.status).toBe("EN_TRANSITO"); // el traslado sigue su camino
    expect(t.lines[0].orderLineId).toBeNull(); // pero ya no está ligado al pedido
    expect(await db.auditLog.count({ where: { action: "TRANSFER_UNLINK_ORDER" } })).toBe(1);

    await receive(transfer.id, variantId, 2);

    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 0 }); // libre, sin reserva
    expect(await db.reservation.count({ where: { locationId: f.loc.BODEGA } })).toBe(0);
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).status).toBe("CANCELADO");
    await expectInvariants();
  });

  it("con el traslado recibido con diferencias: libera lo reservado en bodega y la resolución ya no toca el pedido", async () => {
    const { order, transfer, variantId } = await pendingTransferOrder(3);
    await send(transfer.id);
    await receive(transfer.id, variantId, 2);
    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 2 });

    await cancel(order.id);

    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 0 });
    const [t] = await orderTransfers(order.id);
    expect(t.lines[0].orderLineId).toBeNull();

    // Belén resuelve el faltante como reenvío: ahora es un reenvío común, sin pedido ni reserva.
    const { result } = await resolveTransferAndSync({
      actor: f.actors.belen,
      transferId: transfer.id,
      resolutions: [{ lineId: t.lines[0].id, resolution: "REENVIO" }],
      idempotencyKey: newKey("resolver"),
    });
    const reship = await db.transfer.findUniqueOrThrow({ where: { id: result.reshipTransfer!.id }, include: { lines: true } });
    expect(reship).toMatchObject({ reason: "OTRO", onlineOrderId: null });
    expect(reship.lines[0]).toMatchObject({ orderLineId: null, reservationId: null });
    expect(await stockOf(variantId, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 0 });
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).status).toBe("CANCELADO");
    await expectInvariants();
  });

  it("cancelar y recibir al mismo tiempo: sin bloqueos mutuos y con el stock cuadrado", async () => {
    const { order, transfer, variantId } = await pendingTransferOrder();
    await send(transfer.id);

    const results = await Promise.allSettled([cancel(order.id), receive(transfer.id, variantId, 2)]);

    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    // Gane quien gane, el pedido queda cancelado y la prenda libre en bodega.
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).status).toBe("CANCELADO");
    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 0 });
    await expectInvariants();
  });

  it("cancelar y enviar al mismo tiempo: sin bloqueos mutuos y con el stock cuadrado", async () => {
    const { order, transfer, variantId } = await pendingTransferOrder();

    const results = await Promise.allSettled([cancel(order.id), send(transfer.id)]);

    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).status).toBe("CANCELADO");
    const store = await stockOf(variantId, f.loc.TIENDA_RANCAGUA);
    expect(store.reserved).toBe(0);
    expect([1, 3]).toContain(store.onHand); // 3 si ganó cancelar (anula el traslado), 1 si ganó enviar (viaja libre)
    await expectInvariants();
  });
});
