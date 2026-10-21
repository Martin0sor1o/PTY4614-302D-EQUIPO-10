import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelOrder, getOrderDetail, refundOrder } from "@/modules/orders";
import { expectAppError, expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";
import { confirmTestPayment, prepareTestOrder, registerTestOrder } from "./orders-helpers";

// Reembolso de un pedido cancelado y pagado (Etapa 6): lo registra Belén directamente (sin solicitud, regla 10b).

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const PBA_XL = "PBA041-NEG-XL";

const cancel = (orderId: string) => cancelOrder({ actor: f.actors.belen, orderId, reason: "La clienta se arrepintió", idempotencyKey: newKey("cancelar") });
const refund = (orderId: string, method = "Transferencia", reference: string | undefined = "TRF-REEMB-1", key = newKey("reembolso")) =>
  refundOrder({ actor: f.actors.belen, orderId, method, reference, idempotencyKey: key });

async function cancelledPaidOrder() {
  const order = await registerTestOrder(f, [{ sku: PBA_XL, qty: 2 }], { shippingCost: 3990 });
  await confirmTestPayment(f, order.id);
  const { result } = await cancel(order.id);
  expect(result.refundPending).toBe(true);
  return order;
}

describe("reembolso de un pedido cancelado", () => {
  it("la Sale pasa a ANULADA, desaparece el aviso y queda en audit_log", async () => {
    const pba = await f.variant(PBA_XL);
    const order = await cancelledPaidOrder();
    const stockBefore = await stockOf(pba, f.loc.BODEGA);
    const movements = await db.inventoryMovement.count();

    const { result } = await refund(order.id, "Transferencia", "TRF-REEMB-1");

    expect(result.status).toBe("CANCELADO");
    expect(result.refundPending).toBe(false);
    expect(result.refund).toMatchObject({ method: "Transferencia", reference: "TRF-REEMB-1", byName: "Belén" });
    expect(result.sale).toMatchObject({ number: "BOD-000001", status: "ANULADA" });
    const sale = await db.sale.findUniqueOrThrow({ where: { onlineOrderId: order.id } });
    expect(sale).toMatchObject({ status: "ANULADA", voidedBy: f.actors.belen.id, voidCashSessionId: null, voidApprovalId: null });
    expect(sale.voidedAt).not.toBeNull();
    // No mueve stock (ya lo hizo la cancelación) ni pide aprobación.
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual(stockBefore);
    expect(await db.inventoryMovement.count()).toBe(movements);
    expect(await db.approvalRequest.count()).toBe(0);

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "ORDER_REFUND", entityId: order.id } });
    expect(audit.userId).toBe(f.actors.belen.id);
    expect(audit.after).toMatchObject({ saleNumber: "BOD-000001", amount: order.total, method: "Transferencia", reference: "TRF-REEMB-1", direct: true });
    expect(result.events.at(-1)?.note).toMatch(/Reembolso registrado: \$\d+.*Transferencia \(TRF-REEMB-1\).*BOD-000001 anulada/);
    await expectInvariants();
  });

  it("también tras cancelar un pedido ya PREPARADO (con el reingreso hecho)", async () => {
    const pba = await f.variant(PBA_XL);
    const order = await registerTestOrder(f, [{ sku: PBA_XL, qty: 2 }]);
    const { result: paid } = await confirmTestPayment(f, order.id);
    await prepareTestOrder(f, paid);
    await cancel(order.id);
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 0 });

    const { result } = await refund(order.id, "Efectivo", "");
    expect(result.refundPending).toBe(false);
    expect(result.refund).toMatchObject({ method: "Efectivo", reference: null });
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 0 });
    await expectInvariants();
  });

  it("es idempotente y no se reembolsa dos veces", async () => {
    const order = await cancelledPaidOrder();
    const key = newKey("reembolso");

    const first = await refund(order.id, "Transferencia", "R-1", key);
    const replay = await refund(order.id, "Transferencia", "R-1", key);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    await expectAppError(refund(order.id), "CONFLICT", /ya fue reembolsado/);
    expect(await db.auditLog.count({ where: { action: "ORDER_REFUND" } })).toBe(1);
  });

  it("dos reembolsos simultáneos: se registra uno solo", async () => {
    const order = await cancelledPaidOrder();
    const results = await Promise.allSettled([refund(order.id), refund(order.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: "ORDER_REFUND" } })).toBe(1);
  });

  it("solo se reembolsa un pedido cancelado y pagado, y exige el medio", async () => {
    const live = await registerTestOrder(f, [{ sku: PBA_XL }]);
    await confirmTestPayment(f, live.id);
    await expectAppError(refund(live.id), "CONFLICT", /no está cancelado/);

    const unpaid = await registerTestOrder(f, [{ sku: PBA_XL }]);
    await cancel(unpaid.id);
    await expectAppError(refund(unpaid.id), "VALIDATION", /no tiene un pago que reembolsar/);

    const order = await cancelledPaidOrder();
    await expectAppError(refund(order.id, " "), "VALIDATION", /medio del reembolso/);
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).refundPending).toBe(true);
  });

  it("acceso: la vendedora y la bodega no registran reembolsos", async () => {
    const order = await cancelledPaidOrder();
    for (const actor of [f.actors.vendRga, f.actors.bodega]) {
      await expectAppError(refundOrder({ actor, orderId: order.id, method: "Efectivo", idempotencyKey: newKey("reembolso") }), "FORBIDDEN");
    }
    expect((await db.sale.findUniqueOrThrow({ where: { onlineOrderId: order.id } })).status).toBe("COMPLETADA");
  });
});
