import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  adjustStock,
  cancelTransferCommand,
  listTransfers,
  sendTransferCommand,
  updateTransferDraftCommand,
} from "@/modules/inventory";
import { getOrderDetail, prepareOrder, receiveTransferAndSync } from "@/modules/orders";
import { searchPosItems } from "@/modules/sales";
import { countMovements, expectAppError, expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";
import { allInStore, confirmTestPayment, orderMovements, orderTransfers, prepareTestOrder, registerTestOrder } from "./orders-helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const CPU_2XL = "CPU053-NEG-2XL"; // Rancagua 3 · Bodega 0
const PBA_XL = "PBA041-NEG-XL"; // Rancagua 5 · Bodega 20

const sendFromStore = (transferId: string) => sendTransferCommand({ actor: f.actors.vendRga, transferId, idempotencyKey: newKey("enviar") });
const receiveAtBodega = (transferId: string, lines: { variantId: string; qty: number }[], key = newKey("recibir")) =>
  receiveTransferAndSync({ actor: f.actors.belen, transferId, lines, idempotencyKey: key });

describe("apartar en la tienda con traslado automático (Hito 2)", () => {
  it("flujo completo: reserva en tienda → traslado → la reserva viaja → LISTO_PARA_PREPARAR → picking", async () => {
    const cpu = await f.variant(CPU_2XL);
    const order = await registerTestOrder(f, [{ sku: CPU_2XL, qty: 2 }], { shippingCost: 2990 });
    const movementsBefore = await db.inventoryMovement.count();

    // 1. Confirmar pago apartando en la tienda
    const { result: paid } = await confirmTestPayment(f, order.id, undefined, undefined, allInStore(f, order));
    expect(paid.status).toBe("ESPERANDO_TRASPASO");
    expect(paid.lines[0]).toMatchObject({ sourceLocationId: f.loc.TIENDA_RANCAGUA, sourceLocationName: "Tienda Rancagua" });
    expect(await stockOf(cpu, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 3, reserved: 2 });
    expect(await stockOf(cpu, f.loc.BODEGA)).toEqual({ onHand: 0, reserved: 0 });
    expect(await db.inventoryMovement.count()).toBe(movementsBefore); // ni reservar ni la venta mueven on_hand
    expect(paid.sale).toMatchObject({ number: "BOD-000001", status: "COMPLETADA" });

    // 2. Traslado automático tienda → bodega, ligado al pedido y a sus líneas, en BORRADOR
    const [transfer] = await orderTransfers(order.id);
    expect(transfer).toMatchObject({
      number: "TR-000001",
      status: "BORRADOR",
      reason: "PEDIDO_ONLINE",
      onlineOrderId: order.id,
      fromLocationId: f.loc.TIENDA_RANCAGUA,
      toLocationId: f.loc.BODEGA,
    });
    expect(transfer.lines).toHaveLength(1);
    expect(transfer.lines[0]).toMatchObject({ variantId: cpu, qtySent: 2, orderLineId: order.lines[0].id });
    expect(transfer.lines[0].reservationId).not.toBeNull();
    expect(paid.events.at(-1)?.note).toMatch(/traslado TR-000001/);

    // La tienda lo ve en "Por enviar" y NO se puede editar ni anular desde el traslado.
    const porEnviar = await listTransfers({ bucket: "por-enviar", locationId: f.loc.TIENDA_RANCAGUA });
    expect(porEnviar.map((t) => t.number)).toEqual(["TR-000001"]);
    await expectAppError(
      updateTransferDraftCommand({ actor: f.actors.vendRga, transferId: transfer.id, lines: [{ variantId: cpu, qty: 1 }] }),
      "VALIDATION",
      /ligado a un pedido/,
    );
    await expectAppError(cancelTransferCommand({ actor: f.actors.vendRga, transferId: transfer.id }), "VALIDATION", /ligado a un pedido/);

    // La unidad apartada ya no se vende en el POS: queda 1 disponible y el aviso nombra el pedido.
    const [posItem] = await searchPosItems({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, query: CPU_2XL });
    expect(posItem.here).toEqual({ onHand: 3, reserved: 2, available: 1 });
    expect(posItem.reservedFor).toEqual([{ orderNumber: order.number, qty: 2 }]);

    // 3. La vendedora envía: se consume la reserva de la tienda (TRASPASADA) y baja su físico.
    await sendFromStore(transfer.id);
    expect(await stockOf(cpu, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 0 });
    expect((await db.reservation.findMany({ where: { orderLineId: order.lines[0].id } })).map((r) => r.status)).toEqual(["TRASPASADA"]);
    const inTransit = await getOrderDetail({ actor: f.actors.belen, orderId: order.id });
    expect(inTransit.status).toBe("ESPERANDO_TRASPASO");
    expect(inTransit.lines[0]).toMatchObject({ inTransit: 2, shortage: 0 });
    expect(inTransit.transfers.map((t) => t.status)).toEqual(["EN_TRANSITO"]);
    await expectInvariants();

    // 4. Belén recibe en bodega: nace la reserva firme y el pedido pasa solo a LISTO_PARA_PREPARAR.
    await receiveAtBodega(transfer.id, [{ variantId: cpu, qty: 2 }]);
    expect(await stockOf(cpu, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 2 });
    const reservation = await db.reservation.findFirstOrThrow({ where: { orderLineId: order.lines[0].id, status: "ACTIVA" } });
    expect(reservation).toMatchObject({ locationId: f.loc.BODEGA, quantity: 2, expiresAt: null });
    const ready = await getOrderDetail({ actor: f.actors.belen, orderId: order.id });
    expect(ready.status).toBe("LISTO_PARA_PREPARAR");
    expect(ready.events.at(-1)?.note).toMatch(/Traslado TR-000001 recibido/);
    await expectInvariants();

    // 5. Picking: baja el stock de bodega con VENTA_ONLINE.
    await prepareTestOrder(f, ready);
    expect(await stockOf(cpu, f.loc.BODEGA)).toEqual({ onHand: 0, reserved: 0 });
    expect((await orderMovements(order.id)).map((m) => [m.type, m.quantity])).toEqual([["VENTA_ONLINE", -2]]);
    expect(await countMovements({ variantId: cpu, locationId: f.loc.TIENDA_RANCAGUA })).toBe(2); // carga inicial + traspaso salida
    await expectInvariants();
  });

  it("pedido mixto: una línea en bodega y otra en la tienda; solo la de la tienda viaja", async () => {
    const pba = await f.variant(PBA_XL);
    const cpu = await f.variant(CPU_2XL);
    const order = await registerTestOrder(f, [
      { sku: PBA_XL, qty: 1 },
      { sku: CPU_2XL, qty: 2 },
    ]);

    const { result: paid } = await confirmTestPayment(f, order.id, undefined, undefined, allInStore(f, order, [CPU_2XL]));

    expect(paid.status).toBe("ESPERANDO_TRASPASO");
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 1 }); // la línea de bodega ya está apartada
    expect(await stockOf(cpu, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 3, reserved: 2 });
    const [transfer] = await orderTransfers(order.id);
    expect(transfer.lines.map((l) => l.variantId)).toEqual([cpu]);

    await sendFromStore(transfer.id);
    await receiveAtBodega(transfer.id, [{ variantId: cpu, qty: 2 }]);
    const ready = await getOrderDetail({ actor: f.actors.belen, orderId: order.id });
    expect(ready.status).toBe("LISTO_PARA_PREPARAR");
    await prepareTestOrder(f, ready);
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 19, reserved: 0 });
    expect(await stockOf(cpu, f.loc.BODEGA)).toEqual({ onHand: 0, reserved: 0 });
    await expectInvariants();
  });

  it("la tienda solo se acepta si la bodega no tiene suficiente para la línea completa", async () => {
    const pba = await f.variant(PBA_XL);
    const order = await registerTestOrder(f, [{ sku: PBA_XL, qty: 2 }]);

    // Bodega tiene 20: no se puede apartar en la tienda.
    await expectAppError(
      confirmTestPayment(f, order.id, undefined, undefined, allInStore(f, order)),
      "VALIDATION",
      /bodega tiene 20 disponible.*la tienda solo se usa si la bodega no alcanza/,
    );
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).status).toBe("PENDIENTE_PAGO");
    expect(await db.reservation.count()).toBe(0);
    expect(await db.transfer.count()).toBe(0);

    // Bodega con 1 (menos que las 2 de la línea): ahora sí, y la línea NO se divide (las 2 salen de la tienda).
    await adjustStock({ actor: f.actors.belen, locationId: f.loc.BODEGA, variantId: pba, delta: -19, reason: "Prueba: bodega casi vacía", idempotencyKey: newKey("aj") });
    const { result } = await confirmTestPayment(f, order.id, undefined, undefined, allInStore(f, order));
    expect(result.status).toBe("ESPERANDO_TRASPASO");
    expect(await stockOf(pba, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 5, reserved: 2 });
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 1, reserved: 0 });
  });

  it("solo se acepta una tienda activa con POS (no la bodega)", async () => {
    const order = await registerTestOrder(f, [{ sku: CPU_2XL, qty: 1 }]);
    await expectAppError(
      confirmTestPayment(f, order.id, undefined, undefined, [{ lineId: order.lines[0].id, locationId: f.loc.BODEGA }]),
      "VALIDATION",
      /tienda activa/,
    );
    await expectAppError(
      confirmTestPayment(f, order.id, undefined, undefined, [{ lineId: "linea-que-no-existe", locationId: f.loc.TIENDA_RANCAGUA }]),
      "VALIDATION",
      /no corresponde a este pedido/,
    );
    expect(await db.reservation.count()).toBe(0);
  });

  it("sin disponible en la tienda revierte todo: reservas, traslado, venta y correlativos", async () => {
    const cpu = await f.variant(CPU_2XL);
    const order = await registerTestOrder(f, [{ sku: CPU_2XL, qty: 5 }]); // la tienda tiene 3

    const error = await expectAppError(
      confirmTestPayment(f, order.id, undefined, undefined, allInStore(f, order)),
      "STOCK_INSUFICIENTE",
      /CPU053-NEG-2XL.*Tienda Rancagua/,
    );
    expect(error.details).toMatchObject({ available: 3, requested: 5 });

    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).status).toBe("PENDIENTE_PAGO");
    expect(await stockOf(cpu, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 3, reserved: 0 });
    expect(await db.transfer.count()).toBe(0);
    expect(await db.sale.count()).toBe(0);
    expect(await db.documentCounter.findUnique({ where: { key: "TRANSFER" } })).toBeNull();
    expect(await db.documentCounter.findUnique({ where: { key: "SALE:BOD" } })).toBeNull();
    await expectInvariants();
  });

  it("confirmar es idempotente también al apartar en la tienda (un traslado, una reserva)", async () => {
    const cpu = await f.variant(CPU_2XL);
    const order = await registerTestOrder(f, [{ sku: CPU_2XL, qty: 2 }]);
    const key = newKey("pago");
    const sources = allInStore(f, order);

    const results = await Promise.allSettled([
      confirmTestPayment(f, order.id, undefined, key, sources),
      confirmTestPayment(f, order.id, undefined, key, sources),
    ]);
    const again = await confirmTestPayment(f, order.id, undefined, key, sources);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(again.replayed).toBe(true);
    expect(await db.transfer.count()).toBe(1);
    expect(await db.sale.count()).toBe(1);
    expect(await stockOf(cpu, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 3, reserved: 2 });
    await expectInvariants();
  });

  it("recibir en bodega es idempotente: una sola reserva y un solo juego de movimientos", async () => {
    const cpu = await f.variant(CPU_2XL);
    const order = await registerTestOrder(f, [{ sku: CPU_2XL, qty: 2 }]);
    await confirmTestPayment(f, order.id, undefined, undefined, allInStore(f, order));
    const [transfer] = await orderTransfers(order.id);
    await sendFromStore(transfer.id);
    const key = newKey("recibir");

    const first = await receiveAtBodega(transfer.id, [{ variantId: cpu, qty: 2 }], key);
    const second = await receiveAtBodega(transfer.id, [{ variantId: cpu, qty: 2 }], key);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(await stockOf(cpu, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 2 });
    expect(await db.reservation.count({ where: { locationId: f.loc.BODEGA, status: "ACTIVA" } })).toBe(1);
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).status).toBe("LISTO_PARA_PREPARAR");
  });

  it("no se prepara mientras el pedido espera el traslado", async () => {
    const cpu = await f.variant(CPU_2XL);
    const order = await registerTestOrder(f, [{ sku: CPU_2XL, qty: 1 }]);
    await confirmTestPayment(f, order.id, undefined, undefined, allInStore(f, order));
    await expectAppError(
      prepareOrder({ actor: f.actors.belen, orderId: order.id, scanned: [{ variantId: cpu, qty: 1 }], idempotencyKey: newKey("pick") }),
      "CONFLICT",
      /esperando traslado/,
    );
  });
});
