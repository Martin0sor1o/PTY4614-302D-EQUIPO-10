import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelOrder, refundOrder } from "@/modules/orders";
import { getSalesByPaymentMethod, getSalesSummaryCards } from "@/modules/reports";
import { voidSale } from "@/modules/sales";
import { confirmTestPayment, registerTestOrder } from "./orders-helpers";
import { expectAppError, newKey, resetDemo, type Fixtures } from "./helpers";
import { backdateSale, openRgaCash, posSale, santiago, stockUp } from "./reports-helpers";

let f: Fixtures;
const PBA = "PBA041-NEG-XL";

beforeEach(async () => {
  f = await resetDemo();
  await stockUp(f, PBA, "TIENDA_RANCAGUA", 40);
  await openRgaCash(f);
});

const report = (opts: Partial<Parameters<typeof getSalesByPaymentMethod>[0]> & { from: string; to: string }) =>
  getSalesByPaymentMethod({ actor: f.actors.belen, ...opts });

describe("ventas por medio de pago", () => {
  it("totales por día, semana y mes; las anuladas no cuentan", async () => {
    const mon1 = await posSale(f, { sku: PBA, method: "EFECTIVO", at: santiago("2026-10-26", "10:00") });
    const mon2 = await posSale(f, { sku: PBA, qty: 2, method: "DEBITO", at: santiago("2026-10-26", "15:00") });
    const tue = await posSale(f, { sku: PBA, method: "TRANSFERENCIA", at: santiago("2026-10-27", "11:00") });
    const sunBefore = await posSale(f, { sku: PBA, method: "CREDITO", at: santiago("2026-10-25", "12:00") });
    const sat = await posSale(f, { sku: PBA, method: "DEBITO", at: santiago("2026-10-31", "18:00") });
    const nextMonth = await posSale(f, { sku: PBA, method: "EFECTIVO", at: santiago("2026-11-02", "10:00") });
    // Una venta del día anulada por Belén (RN-12: se anula el mismo día) y luego fechada el martes: no debe sumar.
    const voided = await posSale(f, { sku: PBA, method: "DEBITO", at: new Date() });
    await voidSale({ actor: f.actors.belen, saleId: voided.id, reason: "Error de digitación", idempotencyKey: newKey("anular") });
    await backdateSale(voided.id, santiago("2026-10-27", "12:00"));

    // ── por día ──
    const daily = await report({ from: "2026-10-25", to: "2026-11-02", groupBy: "day" });
    expect(daily.rows.map((r) => r.key)).toEqual([
      "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02",
    ]);
    const day = (k: string) => daily.rows.find((r) => r.key === k)!;
    expect(day("2026-10-26")).toMatchObject({
      count: 2,
      efectivo: mon1.amount,
      debito: mon2.amount,
      tarjeta: mon2.amount,
      transferencia: 0,
      total: mon1.amount + mon2.amount,
      averageTicket: Math.round((mon1.amount + mon2.amount) / 2),
    });
    expect(day("2026-10-27")).toMatchObject({ count: 1, transferencia: tue.amount, total: tue.amount }); // la anulada no está
    expect(day("2026-10-28")).toMatchObject({ count: 0, total: 0, averageTicket: 0 }); // día sin ventas: en cero
    expect(day("2026-10-25")).toMatchObject({ count: 1, credito: sunBefore.amount, tarjeta: sunBefore.amount });

    // ── totales del rango: efectivo + tarjeta + transferencia = total ──
    const all = [mon1, mon2, tue, sunBefore, sat, nextMonth];
    expect(daily.totals.count).toBe(6);
    expect(daily.totals.total).toBe(all.reduce((a, s) => a + s.amount, 0));
    expect(daily.totals.efectivo + daily.totals.tarjeta + daily.totals.transferencia + daily.totals.otros).toBe(daily.totals.total);
    expect(daily.voided).toEqual({ count: 1, total: voided.amount });

    // ── por semana (lunes a domingo) ──
    const weekly = await report({ from: "2026-10-25", to: "2026-11-02", groupBy: "week" });
    expect(weekly.rows.map((r) => [r.key, r.fromDay, r.toDay, r.count])).toEqual([
      ["2026-10-19", "2026-10-25", "2026-10-25", 1], // semana parcial: el rango empieza el domingo
      ["2026-10-26", "2026-10-26", "2026-11-01", 4],
      ["2026-11-02", "2026-11-02", "2026-11-02", 1],
    ]);
    expect(weekly.rows[1].total).toBe(mon1.amount + mon2.amount + tue.amount + sat.amount);

    // ── por mes ──
    const monthly = await report({ from: "2026-10-25", to: "2026-11-02", groupBy: "month" });
    expect(monthly.rows.map((r) => [r.key, r.count])).toEqual([["2026-10", 5], ["2026-11", 1]]);
    expect(monthly.rows[1].efectivo).toBe(nextMonth.amount);
  });

  it("filtra por canal: tienda / online / ambos", async () => {
    const pos = await posSale(f, { sku: PBA, method: "DEBITO", at: santiago("2026-10-27", "11:00") });
    const order = await registerTestOrder(f, [{ sku: PBA }], { shippingCost: 3990 });
    await confirmTestPayment(f, order.id);
    const online = await db.sale.findUniqueOrThrow({ where: { onlineOrderId: order.id }, include: { payments: true } });
    await backdateSale(online.id, santiago("2026-10-27", "13:00"));
    const onlineAmount = online.payments[0].amount;

    const both = await report({ from: "2026-10-27", to: "2026-10-27", channel: "todos" });
    const store = await report({ from: "2026-10-27", to: "2026-10-27", channel: "tienda" });
    const onl = await report({ from: "2026-10-27", to: "2026-10-27", channel: "online" });
    expect(store.totals).toMatchObject({ count: 1, tarjeta: pos.amount, total: pos.amount, transferencia: 0 });
    expect(onl.totals).toMatchObject({ count: 1, transferencia: onlineAmount, total: onlineAmount, shipping: 3990, tarjeta: 0 });
    expect(both.totals.total).toBe(pos.amount + onlineAmount);
    expect(both.totals.count).toBe(2);
  });

  it("pedido cancelado con reembolso pendiente: sigue sumando; al reembolsar la venta desaparece de su día", async () => {
    const order = await registerTestOrder(f, [{ sku: PBA }]);
    await confirmTestPayment(f, order.id);
    const sale = await db.sale.findUniqueOrThrow({ where: { onlineOrderId: order.id }, include: { payments: true } });
    await backdateSale(sale.id, santiago("2026-10-20", "16:00"));
    const amount = sale.payments[0].amount;

    const before = await report({ from: "2026-10-20", to: "2026-10-20" });
    expect(before.totals.total).toBe(amount);
    expect(before.pendingRefunds).toEqual({ orders: 0, amount: 0 });

    await cancelOrder({ actor: f.actors.belen, orderId: order.id, reason: "La clienta se arrepintió", idempotencyKey: newKey("cancel") });
    const pending = await report({ from: "2026-10-20", to: "2026-10-20" });
    expect(pending.totals.total).toBe(amount); // sigue contando: la plata aún no se devolvió
    expect(pending.pendingRefunds).toEqual({ orders: 1, amount });
    expect(pending.voided.count).toBe(0);

    await refundOrder({ actor: f.actors.belen, orderId: order.id, method: "Transferencia", reference: "REEMB-1", idempotencyKey: newKey("refund") });
    const refunded = await report({ from: "2026-10-20", to: "2026-10-20" });
    expect(refunded.totals).toMatchObject({ count: 0, total: 0 });
    expect(refunded.pendingRefunds).toEqual({ orders: 0, amount: 0 });
    expect(refunded.voided).toEqual({ count: 1, total: amount });
  });

  it("borde de zona horaria: una venta a las 23:30 de Santiago cae en su día, no en el siguiente UTC", async () => {
    const late = await posSale(f, { sku: PBA, at: santiago("2026-10-27", "23:30") });
    const early = await posSale(f, { sku: PBA, at: santiago("2026-10-28", "00:30") });
    // 23:30 de Santiago (UTC-3) ya es el 28 en UTC: el reporte debe seguir mostrando el 27.
    expect(late.id).not.toBe(early.id);
    expect((await db.sale.findUniqueOrThrow({ where: { id: late.id } })).createdAt.toISOString()).toBe("2026-10-28T02:30:00.000Z");

    const rows = (await report({ from: "2026-10-27", to: "2026-10-28" })).rows;
    expect(rows.map((r) => [r.key, r.count, r.total])).toEqual([
      ["2026-10-27", 1, late.amount],
      ["2026-10-28", 1, early.amount],
    ]);
    // El filtro de rango usa días de Chile: pedir solo el 27 trae la de las 23:30 y no la de las 00:30.
    expect((await report({ from: "2026-10-27", to: "2026-10-27" })).totals.total).toBe(late.amount);
    expect((await report({ from: "2026-10-28", to: "2026-10-28" })).totals.total).toBe(early.amount);
  });

  it("cambio de horario de Chile: cada venta cae en su día calendario, también el día de 23 h y el de 25 h", async () => {
    // Abril 2026: a las 24:00 del sáb 4 los relojes retroceden; la hora 23:30 ocurre dos veces.
    const a = await posSale(f, { sku: PBA, at: new Date("2026-04-05T02:30:00Z") }); // 23:30 (UTC-3)
    const b = await posSale(f, { sku: PBA, at: new Date("2026-04-05T03:30:00Z") }); // 23:30 otra vez (UTC-4)
    const c = await posSale(f, { sku: PBA, at: new Date("2026-04-05T04:00:00Z") }); // 00:00 del domingo
    const april = await report({ from: "2026-04-03", to: "2026-04-06" });
    expect(april.rows.map((r) => [r.key, r.count])).toEqual([["2026-04-03", 0], ["2026-04-04", 2], ["2026-04-05", 1], ["2026-04-06", 0]]);
    expect(april.rows[1].total).toBe(a.amount + b.amount);
    expect(april.rows[2].total).toBe(c.amount);
    expect((await report({ from: "2026-04-04", to: "2026-04-04" })).totals.count).toBe(2);

    // Septiembre 2026: a las 24:00 del sáb 5 los relojes saltan a las 01:00 del dom 6 (el día 6 dura 23 h).
    const d = await posSale(f, { sku: PBA, at: new Date("2026-09-06T03:59:00Z") }); // 23:59 del sábado 5
    const e = await posSale(f, { sku: PBA, at: new Date("2026-09-06T04:00:00Z") }); // 01:00 del domingo 6
    const sept = await report({ from: "2026-09-05", to: "2026-09-07" });
    expect(sept.rows.map((r) => [r.key, r.count])).toEqual([["2026-09-05", 1], ["2026-09-06", 1], ["2026-09-07", 0]]);
    expect((await report({ from: "2026-09-06", to: "2026-09-06" })).totals.total).toBe(e.amount);
    expect((await report({ from: "2026-09-05", to: "2026-09-05" })).totals.total).toBe(d.amount);
  });

  it("rango inválido: fecha inicial posterior, fecha inexistente o más de 366 días", async () => {
    await expectAppError(report({ from: "2026-10-28", to: "2026-10-27" }), "VALIDATION", /posterior/);
    await expectAppError(report({ from: "2026-02-30", to: "2026-03-01" }), "VALIDATION", /no existe/);
    await expectAppError(report({ from: "2025-01-01", to: "2026-10-27" }), "VALIDATION", /366/);
  });
});

describe("tarjetas del resumen", () => {
  it("ventas de hoy, de la semana (lunes a hoy) y del mes, en hora de Chile", async () => {
    const now = santiago("2026-10-28", "12:00"); // miércoles
    const today = await posSale(f, { sku: PBA, at: santiago("2026-10-28", "09:00") });
    const mon = await posSale(f, { sku: PBA, method: "EFECTIVO", at: santiago("2026-10-26", "10:00") });
    const lateTue = await posSale(f, { sku: PBA, at: santiago("2026-10-27", "23:30") }); // ya es 28 en UTC, pero es martes en Chile
    const sunBefore = await posSale(f, { sku: PBA, at: santiago("2026-10-25", "20:00") }); // semana anterior, mismo mes
    const sept = await posSale(f, { sku: PBA, at: santiago("2026-09-30", "20:00") }); // mes anterior
    void sept;

    const cards = await getSalesSummaryCards({ actor: f.actors.belen, now });
    expect(cards.today).toMatchObject({ fromDay: "2026-10-28", count: 1, total: today.amount });
    expect(cards.week).toMatchObject({ fromDay: "2026-10-26", toDay: "2026-10-28", count: 3, total: today.amount + mon.amount + lateTue.amount });
    expect(cards.month).toMatchObject({ fromDay: "2026-10-01", count: 4, total: today.amount + mon.amount + lateTue.amount + sunBefore.amount });
    expect(cards.pendingRefunds).toEqual({ orders: 0, amount: 0 });
  });
});
