import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelOrder, dispatchOrder, getOrderDetail, markDelivered } from "@/modules/orders";
import { expectAppError, expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";
import { confirmTestPayment, orderMovements, prepareTestOrder, registerTestOrder } from "./orders-helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const PBA_XL = "PBA041-NEG-XL"; // Rancagua 5 · Bodega 20

const cancel = (orderId: string, reason = "La clienta ya no quiere el pedido", key = newKey("cancelar")) =>
  cancelOrder({ actor: f.actors.belen, orderId, reason, idempotencyKey: key });

describe("cancelar pedido", () => {
  it("PENDIENTE_PAGO: sin efectos de stock ni de venta", async () => {
    const pba = await f.variant(PBA_XL);
    const order = await registerTestOrder(f, [{ sku: PBA_XL, qty: 2 }]);
    const movements = await db.inventoryMovement.count();

    const { result } = await cancel(order.id);

    expect(result.status).toBe("CANCELADO");
    expect(result.cancellation).toMatchObject({ reason: "La clienta ya no quiere el pedido", byName: expect.any(String) });
    expect(result.refundPending).toBe(false);
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 0 });
    expect(await db.inventoryMovement.count()).toBe(movements);
    expect(await db.sale.count()).toBe(0);
    await expectInvariants();
  });

  it("LISTO_PARA_PREPARAR: libera las reservas; la venta queda intacta con reembolso pendiente", async () => {
    const pba = await f.variant(PBA_XL);
    const order = await registerTestOrder(f, [{ sku: PBA_XL, qty: 2 }], { shippingCost: 3990 });
    await confirmTestPayment(f, order.id);
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 2 });
    const movements = await db.inventoryMovement.count();

    const { result } = await cancel(order.id);

    expect(result.status).toBe("CANCELADO");
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 0 });
    expect((await db.reservation.findMany()).map((r) => r.status)).toEqual(["LIBERADA"]);
    expect(await db.inventoryMovement.count()).toBe(movements); // liberar no mueve on_hand
    // La Sale no se toca (regla 10b: anular exige aprobación, Etapa 6).
    const sale = await db.sale.findUniqueOrThrow({ where: { onlineOrderId: order.id }, include: { payments: true } });
    expect(sale.status).toBe("COMPLETADA");
    expect(sale.payments).toHaveLength(1);
    expect(result.refundPending).toBe(true);
    expect(result.sale).toMatchObject({ number: "BOD-000001", status: "COMPLETADA" });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "ORDER_CANCEL", entityId: order.id } });
    expect(audit.after).toMatchObject({ saleNumber: "BOD-000001", refundPending: result.total });
    expect(result.events.at(-1)?.note).toMatch(/reembolso pendiente/);
    await expectInvariants();
  });

  it("PREPARADO: reingresa a bodega con REINGRESO_PEDIDO_CANCELADO y el ledger cuadra", async () => {
    const pba = await f.variant(PBA_XL);
    const order = await registerTestOrder(f, [{ sku: PBA_XL, qty: 2 }]);
    const { result: paid } = await confirmTestPayment(f, order.id);
    await prepareTestOrder(f, paid);
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 18, reserved: 0 });

    const { result } = await cancel(order.id, "Se rompió la bolsa");

    expect(result.status).toBe("CANCELADO");
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 0 });
    const movements = await orderMovements(order.id);
    expect(movements.map((m) => [m.type, m.quantity])).toEqual([
      ["VENTA_ONLINE", -2],
      ["REINGRESO_PEDIDO_CANCELADO", 2],
    ]);
    expect(movements[1]).toMatchObject({ locationId: f.loc.BODEGA, userId: f.actors.belen.id, onHandAfter: 20 });
    expect(result.refundPending).toBe(true);
    await expectInvariants(); // ledger = on_hand y reservas activas = reserved
  });

  it("DESPACHADO y ENTREGADO no se cancelan", async () => {
    const order = await registerTestOrder(f, [{ sku: PBA_XL }]);
    const { result: paid } = await confirmTestPayment(f, order.id);
    await prepareTestOrder(f, paid);
    await dispatchOrder({ actor: f.actors.belen, orderId: order.id, courier: "Starken", trackingNumber: "STK-1", idempotencyKey: newKey("d") });

    await expectAppError(cancel(order.id), "CONFLICT", /despachado.*devolución/);
    await markDelivered({ actor: f.actors.belen, orderId: order.id, idempotencyKey: newKey("e") });
    await expectAppError(cancel(order.id), "CONFLICT", /entregado.*devolución/);
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).status).toBe("ENTREGADO");
    await expectInvariants();
  });

  it("exige motivo, no se cancela dos veces y es idempotente", async () => {
    const pba = await f.variant(PBA_XL);
    const order = await registerTestOrder(f, [{ sku: PBA_XL, qty: 2 }]);
    await confirmTestPayment(f, order.id);

    await expectAppError(cancel(order.id, "  "), "VALIDATION", /motivo/);
    const key = newKey("cancelar");
    const first = await cancel(order.id, "Duplicado", key);
    const replay = await cancel(order.id, "Duplicado", key);
    expect(replay.replayed).toBe(true);
    expect(first.result.status).toBe("CANCELADO");
    await expectAppError(cancel(order.id), "CONFLICT", /ya está cancelado/);
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 0 });
    expect(await db.reservation.count({ where: { status: "LIBERADA" } })).toBe(1);
  });

  it("cancelar y preparar al mismo tiempo: el pedido queda cancelado y el stock cuadra, gane quien gane", async () => {
    // Cancelar bloquea el pedido ANTES de leer su estado, así que decide con el estado real:
    //   · si cancela primero → preparar recibe CONFLICT (el pedido ya está cancelado) y las reservas se liberan;
    //   · si prepara primero → cancelar ve PREPARADO y reingresa lo consumido (REINGRESO_PEDIDO_CANCELADO).
    // (Antes de bloquear primero, cancelar podía recibir un CONFLICT espurio por leer el estado sin bloqueo.)
    const pba = await f.variant(PBA_XL);
    const order = await registerTestOrder(f, [{ sku: PBA_XL, qty: 2 }]);
    const { result: paid } = await confirmTestPayment(f, order.id);

    const [cancelled, prepared] = await Promise.allSettled([cancel(order.id), prepareTestOrder(f, paid)]);

    expect(cancelled.status).toBe("fulfilled");
    if (prepared.status === "rejected") expect(prepared.reason).toMatchObject({ code: "CONFLICT" });
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).status).toBe("CANCELADO");
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 0 });
    await expectInvariants();
  });
});
