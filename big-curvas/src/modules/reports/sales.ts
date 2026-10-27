import { db } from "@/lib/db";
import type { Actor } from "@/lib/access";
import { addDaysToKey, daysBetweenKeys, santiagoDayKey, weekKeyOfDayKey } from "@/lib/dates";
import { parseInput } from "@/lib/validation";
import type { Prisma } from "@/generated/prisma/client";
import { assertReportsAccess, divRound, windowOfDays } from "./internal";
import { rangeSchema, salesReportSchema } from "./schemas";
import type {
  PendingRefunds,
  ReportChannel,
  ReportGroupBy,
  SalesBucket,
  SalesByPaymentMethod,
  SalesPeriodRow,
  SalesSummaryCards,
  SummaryPeriod,
} from "./types";

// Reportes de PLATA (ventas por medio de pago y tarjetas del resumen). Solo lectura.
//
// Definiciones (docs/DEMO_PLAN.md, Etapa 6.5):
//  · Cuenta lo cobrado: Σ payments.amount de ventas COMPLETADA (en efectivo ya incluye el redondeo de $10).
//  · Una venta ANULADA no suma: desaparece del día en que se hizo (aunque se anule o reembolse días después).
//  · La venta de un pedido CANCELADO con reembolso pendiente SIGUE sumando hasta que Belén registra el reembolso.
//  · Fecha de la venta = `sales.created_at` (la venta online nace al confirmar el pago), agrupada en America/Santiago.
//  · Canal "tienda" = POS; "online" = INSTAGRAM, WHATSAPP o WEB.

const ONLINE_CHANNELS = ["INSTAGRAM", "WHATSAPP", "WEB"] as const;

function channelWhere(channel: ReportChannel): Prisma.SaleWhereInput {
  if (channel === "tienda") return { channel: "POS" };
  if (channel === "online") return { channel: { in: [...ONLINE_CHANNELS] } };
  return {};
}

type RawBucket = Omit<SalesBucket, "tarjeta" | "averageTicket">;

const emptyRaw = (): RawBucket => ({ count: 0, efectivo: 0, debito: 0, credito: 0, transferencia: 0, otros: 0, total: 0, shipping: 0 });

function finish(b: RawBucket): SalesBucket {
  return { ...b, tarjeta: b.debito + b.credito, averageTicket: divRound(b.total, b.count) };
}

interface SaleRow {
  createdAt: Date;
  shippingCost: number;
  payments: { method: string; amount: number }[];
}

function addSale(b: RawBucket, sale: SaleRow): void {
  b.count += 1;
  b.shipping += sale.shippingCost;
  for (const p of sale.payments) {
    b.total += p.amount;
    if (p.method === "EFECTIVO") b.efectivo += p.amount;
    else if (p.method === "DEBITO") b.debito += p.amount;
    else if (p.method === "CREDITO") b.credito += p.amount;
    else if (p.method === "TRANSFERENCIA") b.transferencia += p.amount;
    else b.otros += p.amount;
  }
}

const saleSelect = {
  createdAt: true,
  shippingCost: true,
  payments: { select: { method: true, amount: true } },
} satisfies Prisma.SaleSelect;

function periodKey(dayKey: string, groupBy: ReportGroupBy): string {
  if (groupBy === "week") return weekKeyOfDayKey(dayKey);
  if (groupBy === "month") return dayKey.slice(0, 7);
  return dayKey;
}

/** Ventas con pedido CANCELADO que siguen COMPLETADA: el reembolso está pendiente (RF-PED-09). */
export async function loadPendingRefunds(): Promise<PendingRefunds> {
  const sales = await db.sale.findMany({
    where: { status: "COMPLETADA", onlineOrder: { is: { status: "CANCELADO" } } },
    select: { payments: { select: { amount: true } } },
  });
  return { orders: sales.length, amount: sales.reduce((acc, s) => acc + s.payments.reduce((a, p) => a + p.amount, 0), 0) };
}

/**
 * Ventas por medio de pago (efectivo, tarjeta, transferencia y total) por día, semana (lunes a domingo) o mes de Chile,
 * con filtro de rango y de canal, cantidad de ventas y ticket promedio. Los períodos sin ventas salen en cero.
 */
export async function getSalesByPaymentMethod(input: {
  actor: Actor;
  from: string;
  to: string;
  channel?: ReportChannel;
  groupBy?: ReportGroupBy;
}): Promise<SalesByPaymentMethod> {
  assertReportsAccess(input.actor);
  const { from, to, channel, groupBy } = parseInput(salesReportSchema, input);
  parseInput(rangeSchema, { from, to });
  const createdAt = windowOfDays(from, to);

  const [sales, voided, pendingRefunds] = await Promise.all([
    db.sale.findMany({ where: { status: "COMPLETADA", createdAt, ...channelWhere(channel) }, select: saleSelect }),
    db.sale.findMany({
      where: { status: "ANULADA", createdAt, ...channelWhere(channel) },
      select: { payments: { select: { amount: true } } },
    }),
    loadPendingRefunds(),
  ]);

  // Períodos del rango, en orden y sin huecos.
  const buckets = new Map<string, { raw: RawBucket; fromDay: string; toDay: string }>();
  for (let i = 0, n = daysBetweenKeys(from, to); i <= n; i++) {
    const day = addDaysToKey(from, i);
    const key = periodKey(day, groupBy);
    const b = buckets.get(key);
    if (b) b.toDay = day;
    else buckets.set(key, { raw: emptyRaw(), fromDay: day, toDay: day });
  }
  const totalsRaw = emptyRaw();
  for (const sale of sales) {
    const key = periodKey(santiagoDayKey(sale.createdAt), groupBy);
    const b = buckets.get(key);
    if (!b) continue; // fuera del rango por el borde de un cambio de horario: no ocurre con ventanas exactas
    addSale(b.raw, sale);
    addSale(totalsRaw, sale);
  }

  const rows: SalesPeriodRow[] = [...buckets.entries()].map(([key, b]) => ({ key, fromDay: b.fromDay, toDay: b.toDay, ...finish(b.raw) }));
  return {
    from,
    to,
    channel,
    groupBy,
    rows,
    totals: finish(totalsRaw),
    voided: { count: voided.length, total: voided.reduce((acc, s) => acc + s.payments.reduce((a, p) => a + p.amount, 0), 0) },
    pendingRefunds,
  };
}

/** Tarjetas del resumen: ventas de hoy, de la semana (lunes a hoy) y del mes, con ambos canales. */
export async function getSalesSummaryCards(input: { actor: Actor; now?: Date }): Promise<SalesSummaryCards> {
  assertReportsAccess(input.actor);
  const today = santiagoDayKey(input.now ?? new Date());
  const weekStart = weekKeyOfDayKey(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const earliest = weekStart < monthStart ? weekStart : monthStart;

  const [sales, pendingRefunds] = await Promise.all([
    db.sale.findMany({ where: { status: "COMPLETADA", createdAt: windowOfDays(earliest, today) }, select: saleSelect }),
    loadPendingRefunds(),
  ]);

  const period = (fromDay: string): SummaryPeriod => {
    const raw = emptyRaw();
    for (const s of sales) if (santiagoDayKey(s.createdAt) >= fromDay) addSale(raw, s);
    return { fromDay, toDay: today, count: raw.count, total: raw.total };
  };
  return { today: period(today), week: period(weekStart), month: period(monthStart), pendingRefunds };
}
