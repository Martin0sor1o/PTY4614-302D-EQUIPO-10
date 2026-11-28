import { beforeEach, describe, expect, it } from "vitest";
import { lastWeeksRange, paymentBars, weekBars } from "@/components/reports/charts";
import { getSalesByPaymentMethod } from "@/modules/reports";
import { expectAppError, resetDemo, type Fixtures } from "./helpers";
import { backdateSale, openRgaCash, santiago, stockUp } from "./reports-helpers";
import { doReturn, sellPos, VALE } from "./returns-helpers";

// Los gráficos de Reportes contra el reporte REAL (ventas y vales creados por los servicios; solo se cambia la fecha).

let f: Fixtures;
const PBA = "PBA041-NEG-XL"; // $8.990
const TODAY = "2026-11-28";

beforeEach(async () => {
  f = await resetDemo();
  await stockUp(f, PBA, "TIENDA_RANCAGUA", 40);
  await openRgaCash(f);
});

const report = (from: string, to: string, extra: { channel?: "todos" | "tienda" | "online"; groupBy?: "day" | "week" } = {}) =>
  getSalesByPaymentMethod({ actor: f.actors.belen, from, to, ...extra });
const sum = (xs: { amount: number }[]) => xs.reduce((a, x) => a + x.amount, 0);

/** Ventas con todos los medios, incluido un canje de vale (lo que cae en «Otros»), repartidas en el tiempo. */
async function history() {
  const cash = await sellPos(f, [{ sku: PBA, qty: 3 }], { method: "EFECTIVO" });
  const debit = await sellPos(f, [{ sku: PBA, qty: 2 }]);
  const transfer = await sellPos(f, [{ sku: PBA }], { method: "TRANSFERENCIA" });
  // Una devolución a vale y una venta pagada con ese vale.
  const { result: returned } = await doReturn(f, debit, [{ sku: PBA }], VALE);
  const withVoucher = await sellPos(f, [{ sku: PBA }], { voucherCode: returned.voucher!.code });
  const old = await sellPos(f, [{ sku: PBA }]);

  await backdateSale(cash.saleId, santiago("2026-11-24", "11:00")); // semana en curso
  await backdateSale(debit.saleId, santiago("2026-11-10", "12:00"));
  await backdateSale(transfer.saleId, santiago("2026-10-05", "00:10")); // primer minuto de la primera semana
  await backdateSale(withVoucher.saleId, santiago("2026-11-22", "23:50")); // domingo en la noche: semana del 16
  await backdateSale(old.saleId, santiago("2026-10-04", "23:50")); // la semana anterior a las 8: queda fuera
}

describe("las barras suman el total del reporte", () => {
  it("por medio de pago, con vales en «Otros»", async () => {
    await history();
    const r = await report("2026-10-01", TODAY);
    expect(r.totals.otros).toBeGreaterThan(0);
    const bars = paymentBars(r.totals);
    expect(bars.map((b) => b.key)).toContain("otros");
    expect(sum(bars)).toBe(r.totals.total);
    expect(r.rows.reduce((a, row) => a + row.total, 0)).toBe(r.totals.total); // y la tabla, lo mismo
  });

  it("por semana: 8 barras que suman el total de esas 8 semanas, con los bordes en hora de Chile", async () => {
    await history();
    const weeks = await report(...(Object.values(lastWeeksRange(TODAY)) as [string, string]), { groupBy: "week" });
    const bars = weekBars(weeks);
    expect(bars).toHaveLength(8);
    expect(sum(bars)).toBe(weeks.totals.total);
    expect(bars.map((b) => b.count)).toEqual([1, 0, 0, 0, 0, 1, 1, 1]); // la del 04-10 no está
    expect(bars[6].key).toBe("2026-11-16"); // el domingo 22 a las 23:50 es de esta semana
    // Coinciden con el reporte diario del mismo rango.
    const daily = await report(weeks.from, weeks.to, { groupBy: "day" });
    expect(daily.totals.total).toBe(weeks.totals.total);
  });

  it("respetan el canal: sin ventas online, las 8 en cero", async () => {
    await history();
    const online = await report("2026-10-05", TODAY, { channel: "online", groupBy: "week" });
    expect(weekBars(online)).toHaveLength(8);
    expect(sum(weekBars(online))).toBe(0);
    expect(online.totals.total).toBe(0);
  });

  it("solo ADMIN: la vendedora no puede pedir las 8 semanas", async () => {
    await expectAppError(
      getSalesByPaymentMethod({ actor: f.actors.vendRga, ...lastWeeksRange(TODAY), groupBy: "week" }),
      "FORBIDDEN",
    );
  });
});
