// Datos de los gráficos de Reportes. Puros: reordenan lo que ya entregó el módulo reports; no consultan ni recalculan
// plata (los montos son los enteros en CLP del reporte).

import { addDaysToKey, weekKeyOfDayKey } from "@/lib/dates";
import type { ReportChannel, SalesBucket, SalesByPaymentMethod } from "@/modules/reports";
import { periodLabel } from "./format";

export const WEEKS_IN_CHART = 8;

export const CHANNEL_TEXT: Record<ReportChannel, string> = { todos: "Tienda y online", tienda: "Solo tienda", online: "Solo online" };

// El nombre de cada barra es el de la columna de la tabla. El color no informa nada por sí solo.
const PAYMENT_BARS = [
  { key: "efectivo", label: "Efectivo", barClass: "bg-brand-black" },
  { key: "tarjeta", label: "Tarjeta", barClass: "bg-primary" },
  { key: "transferencia", label: "Transferencia", barClass: "bg-input" },
  { key: "otros", label: "Otros", barClass: "bg-tone-neutral" },
] as const;

/** Porcentaje del total, para el rótulo. Si hay plata pero redondea a cero, no dice «0 %». */
export function shareText(value: number, total: number): string {
  const share = total > 0 ? Math.round((100 * value) / total) : 0;
  return share === 0 && value > 0 ? "menos de 1 %" : `${share} %`;
}

export interface PaymentBar {
  key: (typeof PAYMENT_BARS)[number]["key"];
  label: string;
  barClass: string;
  amount: number;
}

/** Una barra por medio de pago; juntas suman el total cobrado. «Otros» aparece solo si hay, igual que en la tabla. */
export function paymentBars(totals: SalesBucket): PaymentBar[] {
  return PAYMENT_BARS.filter((b) => b.key !== "otros" || totals.otros > 0).map((b) => ({ ...b, amount: totals[b.key] }));
}

/** Desde el lunes de hace 7 semanas hasta hoy (`today` es el día de Chile, "2026-11-28"). */
export function lastWeeksRange(today: string): { from: string; to: string } {
  return { from: addDaysToKey(weekKeyOfDayKey(today), -7 * (WEEKS_IN_CHART - 1)), to: today };
}

export interface WeekBar {
  key: string;
  label: string;
  amount: number;
  count: number;
  /** La semana de hoy, todavía incompleta. */
  current: boolean;
}

/** A partir del reporte agrupado por semana de ese rango. Las semanas sin ventas vienen en cero. */
export function weekBars(report: SalesByPaymentMethod): WeekBar[] {
  const currentWeek = weekKeyOfDayKey(report.to);
  return report.rows.map((r) => ({ key: r.key, label: periodLabel(r, "week"), amount: r.total, count: r.count, current: r.key === currentWeek }));
}
