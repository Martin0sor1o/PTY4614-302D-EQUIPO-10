import { addDaysToKey, daysBetweenKeys, santiagoDayKey, santiagoParts, startOfDayKeySantiago } from "@/lib/dates";
import { PRODUCTS, STOCK_OVERRIDES, type StockByLocation } from "./seed-data";
import { hashString, seededRandom } from "./random";

// DEMO: plan del historial de ventas de las últimas 8 semanas (Etapa 6.5). Es PURO y determinista: decide qué ventas y
// pedidos ocurren, en qué día y hora. Con él el seed calcula de antemano cuántas unidades consumirá el historial, para
// cargar `stock objetivo + unidades que se venderán` y que, al terminar, el stock quede EXACTAMENTE en el de los casos
// de prueba de DEMO_PLAN.md. La ejecución (history.ts) pasa por los servicios reales.

export const HISTORY_DAYS = 56;
const OPEN_MIN = 10 * 60; // la tienda abre la caja a las 10:00
const FIRST_SALE_MIN = 10 * 60 + 30;
const LAST_SALE_MIN = 19 * 60 + 30;
const CLOSE_MIN = 20 * 60;

export type HistoryPayMethod = "EFECTIVO" | "DEBITO" | "CREDITO" | "TRANSFERENCIA";
export type HistorySeller = "vend-rga" | "vend-rga-2";

export interface HistoryLine {
  sku: string;
  qty: number;
}

export interface HistoryPosSale {
  index: number;
  at: Date;
  seller: HistorySeller;
  lines: HistoryLine[];
  method: HistoryPayMethod;
  /** Belén la anula el mismo día (antes de cerrar la caja). */
  voided: boolean;
}

export interface HistoryDay {
  dayKey: string;
  openAt: Date;
  closeAt: Date;
  sales: HistoryPosSale[];
}

export type HistoryOrderOutcome = "ENTREGA" | "CANCELADO_PENDIENTE" | "CANCELADO_REEMBOLSADO";

export interface HistoryOrder {
  n: number;
  payDay: string;
  paidAt: Date;
  lines: HistoryLine[];
  shipping: number;
  method: Exclude<HistoryPayMethod, "EFECTIVO">;
  outcome: HistoryOrderOutcome;
  /** Cada paso solo existe si su instante ya pasó (`now`). */
  prepareAt: Date | null;
  dispatchAt: Date | null;
  deliverAt: Date | null;
  cancelAt: Date | null;
  refundAt: Date | null;
}

export interface HistoryPlan {
  startDay: string;
  today: string;
  days: HistoryDay[];
  orders: HistoryOrder[];
  /** Unidades que el historial consume por ubicación y SKU (se suman a la carga inicial). */
  extraUnits: { TIENDA_RANCAGUA: Record<string, number>; BODEGA: Record<string, number> };
  posSales: number;
  voidedSales: number;
}

const PAY_WEIGHTS: [HistoryPayMethod, number][] = [
  ["DEBITO", 0.36],
  ["CREDITO", 0.2],
  ["EFECTIVO", 0.25],
  ["TRANSFERENCIA", 0.19],
];

interface SkuInfo {
  sku: string;
  model: string;
  target: StockByLocation;
  weight: number;
}

function allSkus(targets: ReadonlyMap<string, StockByLocation>): SkuInfo[] {
  const rnd = seededRandom(20261027);
  const modelWeight = new Map<string, number>();
  for (const p of PRODUCTS) modelWeight.set(p.model, 0.15 + rnd() ** 2 * 3);
  const out: SkuInfo[] = [];
  for (const p of PRODUCTS) {
    for (const color of p.colors) {
      for (const size of p.sizes) {
        const sku = `${p.model}-${color}-${size}`;
        const r = seededRandom(hashString(`w:${sku}`))();
        // ~1 de cada 4 variantes no se vende nunca: alimentan "sin rotación". La de alta rotación del seed pesa mucho.
        let weight = r < 0.25 ? 0 : modelWeight.get(p.model)! * (0.3 + r);
        if (sku === "PBA041-NEG-XL") weight = 6;
        if (sku in STOCK_OVERRIDES && sku !== "PBA041-NEG-XL") weight = Math.min(weight, 0.6);
        out.push({ sku, model: p.model, target: targets.get(sku) ?? { TIENDA_RANCAGUA: 0, BODEGA: 0 }, weight });
      }
    }
  }
  return out;
}

function pickWeighted<T extends { weight: number }>(items: readonly T[], rnd: () => number): T {
  const total = items.reduce((a, i) => a + i.weight, 0);
  let x = rnd() * total;
  for (const item of items) {
    x -= item.weight;
    if (x < 0) return item;
  }
  return items[items.length - 1];
}

function pickMethod(rnd: () => number): HistoryPayMethod {
  let x = rnd();
  for (const [m, w] of PAY_WEIGHTS) {
    x -= w;
    if (x < 0) return m;
  }
  return "DEBITO";
}

const atMinute = (dayKey: string, minutes: number) => new Date(startOfDayKeySantiago(dayKey).getTime() + minutes * 60_000);
const isSunday = (dayKey: string) => new Date(`${dayKey}T12:00:00Z`).getUTCDay() === 0;

/** Plan completo. `targets` = stock objetivo por SKU (el del seed); `now` = instante del seed. */
export function buildHistoryPlan(now: Date, targets: ReadonlyMap<string, StockByLocation>): HistoryPlan {
  const rnd = seededRandom(99120);
  const skus = allSkus(targets);
  const sellable = skus.filter((s) => s.weight > 0);
  const voidable = sellable.filter((s) => s.target.TIENDA_RANCAGUA >= 1);
  const orderable = sellable.filter((s) => s.target.BODEGA >= 4 && !(s.sku in STOCK_OVERRIDES));

  const today = santiagoDayKey(now);
  const startDay = addDaysToKey(today, -HISTORY_DAYS);
  const nowMin = santiagoParts(now).hour * 60 + santiagoParts(now).minute;
  const extra: HistoryPlan["extraUnits"] = { TIENDA_RANCAGUA: {}, BODEGA: {} };
  const bump = (loc: keyof HistoryPlan["extraUnits"], sku: string, qty: number) => {
    extra[loc][sku] = (extra[loc][sku] ?? 0) + qty;
  };

  const days: HistoryDay[] = [];
  const orders: HistoryOrder[] = [];
  let posIndex = 0;
  let voidedCount = 0;
  let orderN = 0;

  for (let i = 0; i <= HISTORY_DAYS; i++) {
    const dayKey = addDaysToKey(startDay, i);
    if (isSunday(dayKey)) continue;
    const isToday = dayKey === today;
    const dow = new Date(`${dayKey}T12:00:00Z`).getUTCDay(); // 5 = viernes, 6 = sábado
    const limitMin = isToday ? Math.min(LAST_SALE_MIN, nowMin - 30) : LAST_SALE_MIN;

    // ── Ventas de la tienda ──
    const wanted = 2 + Math.floor(rnd() * 4) + (dow === 5 || dow === 6 ? 2 : 0); // 2–5, +2 viernes y sábado
    const minutes: number[] = [];
    if (limitMin >= FIRST_SALE_MIN) {
      for (let k = 0; k < wanted; k++) minutes.push(FIRST_SALE_MIN + Math.floor(rnd() * (limitMin - FIRST_SALE_MIN + 1)));
    }
    minutes.sort((a, b) => a - b);
    const sales: HistoryPosSale[] = [];
    for (const m of minutes) {
      const voided = rnd() < 0.04;
      const lines: HistoryLine[] = [];
      if (voided) {
        // La anulada devuelve el stock: va con 1 unidad de una variante que tenga stock objetivo en la tienda.
        lines.push({ sku: pickWeighted(voidable, rnd).sku, qty: 1 });
      } else {
        const r = rnd();
        const count = r < 0.7 ? 1 : r < 0.95 ? 2 : 3;
        for (let k = 0; k < count; k++) {
          const sku = pickWeighted(sellable, rnd).sku;
          if (lines.some((l) => l.sku === sku)) continue;
          lines.push({ sku, qty: rnd() < 0.85 ? 1 : 2 });
        }
        for (const l of lines) bump("TIENDA_RANCAGUA", l.sku, l.qty);
      }
      if (voided) voidedCount++;
      sales.push({
        index: posIndex++,
        at: atMinute(dayKey, m),
        seller: rnd() < 0.55 ? "vend-rga" : "vend-rga-2",
        lines,
        method: pickMethod(rnd),
        voided,
      });
    }
    if (isToday && sales.length === 0) continue; // la tienda aún no abre hoy: sin caja
    const closeAt = atMinute(dayKey, CLOSE_MIN);
    days.push({ dayKey, openAt: atMinute(dayKey, OPEN_MIN), closeAt: isToday && closeAt > now ? now : closeAt, sales });

    // ── Pedidos online (se pagan este día) ──
    const orderCount = rnd() < 0.7 ? 1 : rnd() < 0.85 ? 0 : 2;
    for (let k = 0; k < orderCount; k++) {
      const payMin = 9 * 60 + Math.floor(rnd() * 11 * 60); // 09:00–20:00
      if (isToday && payMin > nowMin - 30) continue;
      const lines: HistoryLine[] = [];
      const lineCount = rnd() < 0.7 ? 1 : 2;
      for (let l = 0; l < lineCount; l++) {
        const sku = pickWeighted(orderable, rnd).sku;
        if (!lines.some((x) => x.sku === sku)) lines.push({ sku, qty: 1 });
      }
      const roll = rnd();
      const recent = daysBetweenKeys(dayKey, today) <= 20;
      const outcome: HistoryOrderOutcome =
        roll < 0.08 ? (recent ? "CANCELADO_PENDIENTE" : "CANCELADO_REEMBOLSADO") : roll < 0.14 ? "CANCELADO_REEMBOLSADO" : "ENTREGA";
      const paidAt = atMinute(dayKey, payMin);
      const when = (instant: Date) => (instant.getTime() <= now.getTime() - 30 * 60_000 ? instant : null);
      const nextDay = addDaysToKey(dayKey, 1);
      const prepareAt = outcome === "ENTREGA" ? when(atMinute(nextDay, 11 * 60)) : null;
      const dispatchAt = prepareAt ? when(atMinute(nextDay, 16 * 60 + 30)) : null;
      const deliverAt = dispatchAt ? when(atMinute(addDaysToKey(nextDay, 2), 15 * 60)) : null;
      const cancelAt = outcome === "ENTREGA" ? null : when(atMinute(nextDay, 12 * 60));
      const refundAt = outcome === "CANCELADO_REEMBOLSADO" && cancelAt ? when(atMinute(addDaysToKey(nextDay, 1), 12 * 60)) : null;
      if (prepareAt) for (const l of lines) bump("BODEGA", l.sku, l.qty);
      orders.push({
        n: ++orderN,
        payDay: dayKey,
        paidAt,
        lines,
        shipping: rnd() < 0.6 ? 3990 : 4990,
        method: (["TRANSFERENCIA", "TRANSFERENCIA", "TRANSFERENCIA", "DEBITO", "CREDITO"] as const)[Math.floor(rnd() * 5)],
        outcome,
        prepareAt,
        dispatchAt,
        deliverAt,
        cancelAt,
        refundAt,
      });
    }
  }

  return { startDay, today, days, orders, extraUnits: extra, posSales: posIndex, voidedSales: voidedCount };
}
