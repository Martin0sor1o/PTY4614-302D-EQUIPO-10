import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getOrderDetail } from "@/modules/orders";
import { expectAppError, expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";
import { confirmTestPayment, registerTestOrder } from "./orders-helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const PBA_XL = "PBA041-NEG-XL"; // Rancagua 5 · Bodega 20
const CPU_2XL = "CPU053-NEG-2XL"; // Rancagua 3 · Bodega 0
const JMT_48 = "JMT012-NEG-48"; // Rancagua 0 · Bodega 6

describe("confirmar pago", () => {
  it("reserva en BODEGA y crea la venta online sin movimientos de stock", async () => {
    const variantId = await f.variant(PBA_XL);
    const order = await registerTestOrder(f, [{ sku: PBA_XL, qty: 2 }], { shippingCost: 3990 });
    const movementsBefore = await db.inventoryMovement.count();
    const tiendaBefore = await stockOf(variantId, f.loc.TIENDA_RANCAGUA);

    const { result, replayed } = await confirmTestPayment(f, order.id, { method: "TRANSFERENCIA", reference: "TRF-777" });

    expect(replayed).toBe(false);
    expect(result.status).toBe("LISTO_PARA_PREPARAR");
    expect(result.payment).toMatchObject({ method: "TRANSFERENCIA", reference: "TRF-777" });
    // Reserva en bodega: on_hand intacto, reserved +2. La tienda no se toca.
    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 2 });
    expect(await stockOf(variantId, f.loc.TIENDA_RANCAGUA)).toEqual(tiendaBefore);
    expect(await db.inventoryMovement.count()).toBe(movementsBefore); // la venta NO mueve stock (RN-08)
    const reservation = await db.reservation.findMany();
    expect(reservation).toHaveLength(1);
    expect(reservation[0]).toMatchObject({ status: "ACTIVA", locationId: f.loc.BODEGA, quantity: 2, orderLineId: order.lines[0].id, expiresAt: null });

    // La venta: canal INSTAGRAM en BODEGA, correlativo BOD-…, sin caja, con envío dentro del total.
    const sale = await db.sale.findUniqueOrThrow({ where: { onlineOrderId: order.id }, include: { lines: true, payments: true } });
    expect(sale).toMatchObject({
      number: "BOD-000001",
      channel: "INSTAGRAM",
      locationId: f.loc.BODEGA,
      cashSessionId: null,
      sellerId: f.actors.belen.id,
      customerId: order.customer.id,
      status: "COMPLETADA",
      shippingCost: 3990,
      subtotal: order.subtotal,
      discountTotal: 0,
      total: order.total,
      roundingAdjustment: 0,
    });
    expect(sale.total).toBe(sale.subtotal - sale.discountTotal + sale.shippingCost);
    expect(sale.lines).toHaveLength(1);
    expect(sale.lines[0]).toMatchObject({ variantId, quantity: 2, unitPrice: order.lines[0].unitPrice });
    expect(sale.payments).toHaveLength(1);
    expect(sale.payments[0]).toMatchObject({ method: "TRANSFERENCIA", reference: "TRF-777" });
    // Invariante: SUM(payments) = total + rounding_adjustment
    expect(sale.payments.reduce((a, p) => a + p.amount, 0)).toBe(sale.total + sale.roundingAdjustment);

    expect(result.sale).toMatchObject({ number: "BOD-000001", total: order.total });
    expect(result.events.map((e) => e.status)).toEqual(["PENDIENTE_PAGO", "LISTO_PARA_PREPARAR"]);
    await expectInvariants();
  });

  it("en efectivo el pago lleva el redondeo a $10 y SUM(payments) = total + rounding_adjustment", async () => {
    // Envío de $7 sobre el precio: el total termina en un dígito que obliga a redondear.
    const order = await registerTestOrder(f, [{ sku: PBA_XL }], { shippingCost: 3 });
    expect(order.total % 10).not.toBe(0);

    await confirmTestPayment(f, order.id, { method: "EFECTIVO" });

    const sale = await db.sale.findUniqueOrThrow({ where: { onlineOrderId: order.id }, include: { payments: true } });
    expect(sale.roundingAdjustment).not.toBe(0);
    expect(sale.total).toBe(order.total); // el rounding va aparte, no dentro de total
    const paid = sale.payments.reduce((a, p) => a + p.amount, 0);
    expect(paid).toBe(sale.total + sale.roundingAdjustment);
    expect(paid % 10).toBe(0);
    expect(sale.payments[0].cashReceived).toBeNull();
  });

  it("exige la referencia salvo en efectivo, y no cambia nada si falta", async () => {
    const order = await registerTestOrder(f, [{ sku: PBA_XL }]);
    await expectAppError(confirmTestPayment(f, order.id, { method: "TRANSFERENCIA" }), "VALIDATION", /referencia/);
    await expectAppError(confirmTestPayment(f, order.id, { method: "DEBITO", reference: "  " }), "VALIDATION", /referencia/);
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).status).toBe("PENDIENTE_PAGO");
    expect(await db.reservation.count()).toBe(0);
    expect(await db.sale.count()).toBe(0);
  });

  it("sin stock revierte TODO (reservas, venta, correlativo y estado) y nombra la prenda", async () => {
    const pba = await f.variant(PBA_XL);
    const order = await registerTestOrder(f, [
      { sku: PBA_XL, qty: 2 },
      { sku: CPU_2XL, qty: 1 }, // bodega 0: no alcanza
    ]);

    const error = await expectAppError(confirmTestPayment(f, order.id), "STOCK_INSUFICIENTE", /CPU053-NEG-2XL.*Bodega/);
    expect(error.details).toMatchObject({ sku: CPU_2XL, available: 0, requested: 1 });

    const after = await getOrderDetail({ actor: f.actors.belen, orderId: order.id });
    expect(after.status).toBe("PENDIENTE_PAGO");
    expect(after.payment).toBeNull();
    expect(after.events).toHaveLength(1);
    expect(await db.reservation.count()).toBe(0);
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 0 }); // la línea que sí alcanzaba se revirtió
    expect(await db.sale.count()).toBe(0);
    expect(await db.payment.count()).toBe(0);
    expect(await db.documentCounter.findUnique({ where: { key: "SALE:BOD" } })).toBeNull(); // sin huecos en el correlativo
    await expectInvariants();
  });

  it("se puede reintentar tras el error cuando vuelve a haber stock", async () => {
    const order = await registerTestOrder(f, [{ sku: CPU_2XL, qty: 1 }]);
    await expectAppError(confirmTestPayment(f, order.id), "STOCK_INSUFICIENTE");
    const cpu = await f.variant(CPU_2XL);
    const { adjustStock } = await import("@/modules/inventory");
    await adjustStock({ actor: f.actors.belen, locationId: f.loc.BODEGA, variantId: cpu, delta: 2, reason: "Reposición de prueba", idempotencyKey: newKey("aj") });

    const { result } = await confirmTestPayment(f, order.id);
    expect(result.status).toBe("LISTO_PARA_PREPARAR");
    expect(await stockOf(cpu, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 1 });
  });

  it("es idempotente: repetir la clave no reserva ni vende dos veces", async () => {
    const variantId = await f.variant(PBA_XL);
    const order = await registerTestOrder(f, [{ sku: PBA_XL, qty: 2 }]);
    const key = newKey("pago");

    const first = await confirmTestPayment(f, order.id, undefined, key);
    const second = await confirmTestPayment(f, order.id, undefined, key);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result.sale?.id).toBe(first.result.sale?.id);
    expect(await db.sale.count()).toBe(1);
    expect(await db.reservation.count()).toBe(1);
    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 2 });
    expect(await db.onlineOrderEvent.count({ where: { orderId: order.id } })).toBe(2);
  });

  it("doble clic simultáneo (misma clave): una sola venta y una sola reserva", async () => {
    const variantId = await f.variant(PBA_XL);
    const order = await registerTestOrder(f, [{ sku: PBA_XL, qty: 2 }]);
    const key = newKey("pago");

    const results = await Promise.allSettled([confirmTestPayment(f, order.id, undefined, key), confirmTestPayment(f, order.id, undefined, key)]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await db.sale.count()).toBe(1);
    expect(await db.reservation.count()).toBe(1);
    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 2 });
    await expectInvariants();
  });

  it("dos confirmaciones con claves distintas: gana una y la otra recibe CONFLICT", async () => {
    const variantId = await f.variant(PBA_XL);
    const order = await registerTestOrder(f, [{ sku: PBA_XL, qty: 2 }]);

    const results = await Promise.allSettled([confirmTestPayment(f, order.id), confirmTestPayment(f, order.id)]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toMatchObject({ code: "CONFLICT" });
    expect(await db.sale.count()).toBe(1);
    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 2 });
    await expectInvariants();
  });

  it("confirmar un pedido que ya no está pendiente de pago es CONFLICT", async () => {
    const order = await registerTestOrder(f, [{ sku: JMT_48 }]);
    await confirmTestPayment(f, order.id);
    await expectAppError(confirmTestPayment(f, order.id), "CONFLICT", /no se puede confirmar el pago/);
    expect(await db.sale.count()).toBe(1);
  });

  it("reutilizar una clave de otro pedido es CONFLICT", async () => {
    const a = await registerTestOrder(f, [{ sku: PBA_XL }]);
    const b = await registerTestOrder(f, [{ sku: JMT_48 }]);
    const key = newKey("pago");
    await confirmTestPayment(f, a.id, undefined, key);
    await expectAppError(confirmTestPayment(f, b.id, undefined, key), "CONFLICT", /otro pedido/);
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: b.id })).status).toBe("PENDIENTE_PAGO");
  });
});
