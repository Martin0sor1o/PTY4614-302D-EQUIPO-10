import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { santiagoDayKey } from "@/lib/dates";
import type { SalesBucket, SalesByPaymentMethod, SalesPeriodRow } from "@/modules/reports";
import { lastWeeksRange, paymentBars, shareText, weekBars, WEEKS_IN_CHART } from "./charts";
import { SalesTab } from "./sales-tab";
import { WeeklyChart } from "./weekly-chart";

// Los gráficos con datos armados a mano. Que sumen lo mismo que el reporte REAL (con ventas en la base) está en
// tests/integration/reports-charts.test.ts.

const bucket = (patch: Partial<SalesBucket> = {}): SalesBucket => ({
  count: 0, efectivo: 0, debito: 0, credito: 0, tarjeta: 0, transferencia: 0, otros: 0, total: 0, shipping: 0, averageTicket: 0, ...patch,
});

const TOTALS = bucket({ count: 4, efectivo: 12_990, debito: 8_000, credito: 5_000, tarjeta: 13_000, transferencia: 7_010, otros: 9_000, total: 42_000, averageTicket: 10_500 });

const MONDAYS = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"];
const SUNDAYS = ["2026-10-11", "2026-10-18", "2026-10-25", "2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-28"];
const week = (i: number, patch: Partial<SalesBucket> = {}): SalesPeriodRow => ({ key: MONDAYS[i], fromDay: MONDAYS[i], toDay: SUNDAYS[i], ...bucket(patch) });

const weekly: SalesByPaymentMethod = {
  from: "2026-10-05",
  to: "2026-11-28",
  channel: "tienda",
  groupBy: "week",
  rows: MONDAYS.map((_, i) => (i === 1 ? week(i, { count: 1, total: 30_000 }) : i === 7 ? week(i, { count: 3, total: 12_000 }) : week(i))),
  totals: bucket({ count: 4, total: 42_000 }),
  voided: { count: 0, total: 0 },
  pendingRefunds: { orders: 0, amount: 0 },
};

const sum = (xs: { amount: number }[]) => xs.reduce((a, x) => a + x.amount, 0);
const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("barras por medio de pago", () => {
  it("suman el total del reporte, con «Otros» incluido", () => {
    const bars = paymentBars(TOTALS);
    expect(bars.map((b) => b.label)).toEqual(["Efectivo", "Tarjeta", "Transferencia", "Otros"]);
    expect(sum(bars)).toBe(TOTALS.total);
  });

  it("sin otros pagos no aparece la barra, y siguen sumando el total", () => {
    const totals = bucket({ efectivo: 1_000, tarjeta: 2_000, total: 3_000 });
    expect(paymentBars(totals).map((b) => b.key)).toEqual(["efectivo", "tarjeta", "transferencia"]);
    expect(sum(paymentBars(totals))).toBe(totals.total);
  });

  it("un medio con plata nunca se rotula «0 %»", () => {
    expect(shareText(8_990, 3_900_060)).toBe("menos de 1 %");
    expect(shareText(0, 3_900_060)).toBe("0 %");
    expect(shareText(0, 0)).toBe("0 %");
    expect(shareText(960_520, 3_900_060)).toBe("25 %");
  });

  const report = (totals: SalesBucket): SalesByPaymentMethod => ({ ...weekly, groupBy: "day", rows: [{ key: "2026-11-28", fromDay: "2026-11-28", toDay: "2026-11-28", ...totals }], totals });

  it("en pantalla, «Otros» se llama igual que la columna de la tabla, se explica y la tabla sigue estando", () => {
    const html = renderToStaticMarkup(createElement(SalesTab, { report: report(TOTALS) }));
    const heads = [...html.matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => m[1]);
    expect(heads).toContain("Otros");
    const list = /<ul aria-label="Total cobrado por medio de pago en el rango elegido"[\s\S]*?<\/ul>/.exec(html)?.[0] ?? "";
    expect(textOf(list)).toContain("Otros $9.000 · 21 %");
    expect(html).toContain("Otros = pagos con vale, también el crédito de un cambio.");
    expect(html).toContain("<table");
    expect(list.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(8); // punto y barra de cada fila: decorativos
  });

  it("sin «Otros» no hay barra, columna ni nota", () => {
    const html = renderToStaticMarkup(createElement(SalesTab, { report: report(bucket({ count: 1, efectivo: 1_000, total: 1_000 })) }));
    expect(html).not.toContain("Otros");
  });
});

describe("las últimas 8 semanas", () => {
  it("van desde el lunes de hace 7 semanas hasta hoy", () => {
    expect(lastWeeksRange("2026-11-28")).toEqual({ from: "2026-10-05", to: "2026-11-28" }); // sábado
    expect(lastWeeksRange("2026-11-29")).toEqual({ from: "2026-10-05", to: "2026-11-29" }); // domingo: misma semana
    expect(lastWeeksRange("2026-11-30")).toEqual({ from: "2026-10-12", to: "2026-11-30" }); // lunes: entra una nueva
  });

  it("la semana cambia a medianoche de Chile, no de UTC", () => {
    const sundayNightInChile = new Date("2026-11-30T02:30:00.000Z"); // en Chile aún es domingo 29 a las 23:30
    expect(lastWeeksRange(santiagoDayKey(sundayNightInChile)).from).toBe("2026-10-05");
    expect(lastWeeksRange(santiagoDayKey(new Date("2026-11-30T03:30:00.000Z"))).from).toBe("2026-10-12");
  });

  it("una barra por semana, también las sin ventas; solo la de hoy va «en curso»; suman el total", () => {
    const bars = weekBars(weekly);
    expect(bars).toHaveLength(WEEKS_IN_CHART);
    expect(bars.filter((b) => b.current).map((b) => b.key)).toEqual(["2026-11-23"]);
    expect(bars[0]).toMatchObject({ label: "Sem. 05-10 al 11-10", amount: 0 });
    expect(sum(bars)).toBe(weekly.totals.total);
  });

  const html = renderToStaticMarkup(createElement(WeeklyChart, { report: weekly }));

  it("aclara en pantalla que no dependen del rango, y con qué canal están", () => {
    expect(textOf(html)).toContain("No dependen del rango de fechas elegido");
    expect(textOf(html)).toContain("Sí respetan el canal: Solo tienda");
  });

  it("se lee sin ver las barras: lista con nombre, y cada semana con monto, ventas y «en curso» en texto", () => {
    expect(html).toContain('aria-label="Total cobrado por semana, últimas 8 semanas"');
    const rows = [...html.matchAll(/<li[\s\S]*?<\/li>/g)].map((m) => textOf(m[0]).trim());
    expect(rows).toHaveLength(8);
    expect(rows[0]).toBe("Sem. 05-10 al 11-10 $0 · sin ventas");
    expect(rows[1]).toBe("Sem. 12-10 al 18-10 $30.000 · 1 venta");
    expect(rows[7]).toBe("Sem. 23-11 al 28-11 (en curso) $12.000 · 3 ventas");
    expect(textOf(html)).toContain("Total de las 8 semanas: $42.000 · 4 ventas");
  });

  it("las barras son decorativas; la semana en curso además va rayada", () => {
    const tracks = html.match(/<span class="block h-3[^"]*" aria-hidden="true">/g) ?? [];
    expect(tracks).toHaveLength(8);
    expect(html.match(/repeating-linear-gradient/g)).toHaveLength(1);
    expect(html).not.toContain("<script");
  });

  it("se muestra aunque el rango elegido no tenga ventas", () => {
    const empty: SalesByPaymentMethod = { ...weekly, rows: [], totals: bucket() };
    const page = renderToStaticMarkup(createElement(SalesTab, { report: empty, weekly: createElement(WeeklyChart, { report: weekly }) }));
    expect(page).toContain("No hay ventas en este rango");
    expect(page).toContain('data-testid="weekly-chart"');
  });
});
