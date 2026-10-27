import type { ReportGroupBy, SalesPeriodRow } from "@/modules/reports";

// Etiquetas de los reportes. Las claves de día ("2026-10-27") son fechas de calendario de Chile: se formatean en UTC
// (a mediodía) solo para obtener el nombre del día/mes, sin que la zona del servidor las mueva.

const WEEKDAY = new Intl.DateTimeFormat("es-CL", { weekday: "short", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" });

const noon = (dayKey: string) => new Date(`${dayKey}T12:00:00Z`);

/** "27-10-2026" */
export function dayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-");
  return `${d}-${m}-${y}`;
}

/** "27-10" */
export function shortDayLabel(dayKey: string): string {
  const [, m, d] = dayKey.split("-");
  return `${d}-${m}`;
}

export function weekdayLabel(dayKey: string): string {
  return WEEKDAY.format(noon(dayKey)).replace(".", "");
}

export function periodLabel(row: SalesPeriodRow, groupBy: ReportGroupBy): string {
  if (groupBy === "day") return `${weekdayLabel(row.key)} ${dayLabel(row.key)}`;
  if (groupBy === "week") return `Sem. ${shortDayLabel(row.fromDay)} al ${shortDayLabel(row.toDay)}`;
  const label = MONTH.format(noon(`${row.key}-01`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Ancho de barra (0–100) solo para dibujar; no es un monto. */
export function barPercent(value: number, max: number): number {
  return max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((100 * value) / max)) : 0;
}

export const pluralize = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
