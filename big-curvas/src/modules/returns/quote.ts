import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { assertAccess, type Actor, type Role } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import { approvalNeed, proratedAmount, quoteRefund, splitExchange } from "./pricing";
import { loadSaleForReturn, priceNewLines, type LoadedSale, type PricedNewLines } from "./internal";
import { getReturnPolicy, type ReturnPolicy } from "./policy";
import { quoteReturnSchema, type ReturnLineInput, type ReturnResolutionInput } from "./schemas";
import type { QuotedLine, ReturnQuote } from "./types";

/**
 * Huella de lo que Belén aprueba (ADR-014): SHA-256 de un JSON canónico con la venta, la ubicación, las líneas devueltas
 * `{saleLineId, qty, condición}` ordenadas, el destino (vale / dinero + medio / cambio + prendas nuevas ordenadas). La
 * referencia del reembolso y el medio de pago de la diferencia NO entran: no cambian lo aprobado.
 */
export function returnBinding(input: {
  saleId: string;
  locationId: string;
  lines: readonly { saleLineId: string; qty: number; condition: string }[];
  resolution: ReturnResolutionInput;
}): string {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const lines = [...input.lines].map((l) => ({ l: l.saleLineId, q: l.qty, c: l.condition })).sort((a, b) => cmp(a.l, b.l));
  const r = input.resolution;
  const resolution =
    r.kind === "VALE"
      ? { k: "VALE" }
      : r.kind === "DINERO"
        ? { k: "DINERO", m: r.method }
        : {
            k: "CAMBIO",
            n: [...r.newLines.reduce((m, l) => m.set(l.variantId, (m.get(l.variantId) ?? 0) + l.qty), new Map<string, number>())]
              .map(([v, q]) => ({ v, q }))
              .sort((a, b) => cmp(a.v, b.v)),
          };
  const canonical = JSON.stringify({ s: input.saleId, loc: input.locationId, lines, resolution });
  return createHash("sha256").update(`return:${canonical}`).digest("hex");
}

const METHOD_PHRASE = { EFECTIVO: "efectivo", ANULACION_TRANSBANK: "anulación en la máquina", TRANSFERENCIA: "transferencia" } as const;
const PAID_WITH = { EFECTIVO: "efectivo", ANULACION_TRANSBANK: "tarjeta", TRANSFERENCIA: "transferencia" } as const;

export interface QuoteInputs {
  sale: LoadedSale;
  location: { id: string; name: string; sellsPos: boolean };
  actorRole: Role;
  policy: ReturnPolicy;
  lines: readonly ReturnLineInput[];
  resolution: ReturnResolutionInput;
  /** Precio de las prendas nuevas (solo CAMBIO). */
  priced: PricedNewLines | null;
  /** Unidades ya devueltas por línea AL MOMENTO DE EJECUTAR (después del UPDATE atómico); sin esto se usan las leídas. */
  returnedBefore?: ReadonlyMap<string, number>;
  cashOpen: boolean;
}

/** Une las líneas repetidas y verifica que existan en la venta. Cada línea se devuelve entera con UNA condición. */
export function mergeLines(sale: LoadedSale, lines: readonly ReturnLineInput[]): ReturnLineInput[] {
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.saleLineId)) {
      throw new AppError("VALIDATION", "Una misma prenda aparece dos veces. Si parte está dañada y parte no, haz dos devoluciones.");
    }
    seen.add(l.saleLineId);
    if (!sale.lineByid.has(l.saleLineId)) throw new AppError("VALIDATION", "Una de las prendas no pertenece a la venta indicada.");
  }
  return [...lines];
}

/**
 * Cotización: valida las reglas de negocio y calcula montos con funciones puras (sin tocar la BD). La usan `quoteReturn`
 * (para mostrar) y `createReturn` (al ejecutar, con las cantidades ya devueltas confirmadas por el UPDATE atómico).
 */
export function buildQuote(ctx: QuoteInputs): ReturnQuote {
  const { sale, location, policy, resolution } = ctx;
  const lines = mergeLines(sale, ctx.lines);

  const quotedLines: QuotedLine[] = lines.map((l) => {
    const sl = sale.lineByid.get(l.saleLineId)!;
    const already = ctx.returnedBefore?.get(l.saleLineId) ?? sl.returnedQty;
    const available = sl.soldQty - already;
    if (l.qty > available) {
      throw new AppError(
        "CONFLICT",
        available === 0
          ? `${sl.sku} ya se devolvió completo (vendidas ${sl.soldQty}, devueltas ${already}).`
          : `De ${sl.sku} solo se pueden devolver ${available} más (vendidas ${sl.soldQty}, devueltas ${already}).`,
        { saleLineId: sl.saleLineId, sold: sl.soldQty, returned: already, available },
      );
    }
    return {
      saleLineId: sl.saleLineId,
      variantId: sl.variantId,
      sku: sl.sku,
      productName: sl.productName,
      color: sl.color,
      size: sl.size,
      qty: l.qty,
      condition: l.condition,
      amount: proratedAmount(sl.lineTotal, sl.soldQty, already, l.qty),
    };
  });
  const valueReturned = quotedLines.reduce((a, l) => a + l.amount, 0);
  if (valueReturned <= 0) throw new AppError("VALIDATION", "Lo que se pagó por esas prendas fue $0: no hay nada que devolver.");

  const warnings: string[] = [];
  let refund: ReturnQuote["refund"] = null;
  let voucherAmount = 0;
  let exchange: ReturnQuote["exchange"] = null;

  if (resolution.kind === "VALE") {
    voucherAmount = valueReturned;
  } else if (resolution.kind === "DINERO") {
    // S-07: lo pagado con vale vuelve como vale, nunca como dinero.
    if (sale.paidWithVoucher) {
      throw new AppError("VALIDATION", `La venta ${sale.number} se pagó (en parte) con vale: solo se puede devolver en vale o con un cambio.`);
    }
    if (resolution.method === "EFECTIVO") {
      if (!location.sellsPos) throw new AppError("VALIDATION", `${location.name} no tiene caja: elige transferencia, anulación en la máquina o vale.`);
      if (!ctx.cashOpen) warnings.push("No hay caja abierta en esta tienda: ábrela para devolver en efectivo.");
    } else if (!resolution.reference?.trim()) {
      throw new AppError(
        "VALIDATION",
        resolution.method === "TRANSFERENCIA" ? "Escribe el N° de la transferencia del reembolso." : "Escribe el N° de la anulación en la máquina.",
      );
    }
    const q = quoteRefund(valueReturned, resolution.method);
    if (q.amount <= 0) throw new AppError("VALIDATION", "El monto a devolver en efectivo queda en $0 tras el redondeo: devuélvelo en vale.");
    refund = { method: resolution.method, amount: q.amount, roundingAdjustment: q.roundingAdjustment };
    // S-06: el medio sugerido es el original. Devolver por otro medio es posible (Belén/la vendedora con aprobación), pero se advierte.
    if (resolution.method !== sale.suggestedRefundMethod) {
      const original = METHOD_PHRASE[sale.suggestedRefundMethod];
      warnings.push(
        resolution.method === "EFECTIVO"
          ? `La venta ${sale.number} se pagó con ${PAID_WITH[sale.suggestedRefundMethod]}: lo sugerido es devolver por ${original}, no en efectivo. Revisa que sea lo que corresponde.`
          : `El medio original de la venta ${sale.number} era ${PAID_WITH[sale.suggestedRefundMethod]}: lo sugerido es devolver por ${original}.`,
      );
    }
  } else {
    if (!location.sellsPos) throw new AppError("VALIDATION", `${location.name} no vende al público: ahí solo se registran devoluciones, no cambios (S-10).`);
    if (!ctx.priced) throw new AppError("VALIDATION", "Falta el precio de las prendas nuevas del cambio.");
    const split = splitExchange(valueReturned, ctx.priced.total);
    voucherAmount = split.leftover;
    exchange = { newTotal: ctx.priced.total, ...split, newLines: ctx.priced.lines };
    if (!ctx.cashOpen) warnings.push("No hay caja abierta en esta tienda: ábrela para hacer el cambio.");
  }

  const need = approvalNeed({
    isMoneyRefund: resolution.kind === "DINERO",
    outOfWindow: sale.outOfWindow,
    daysSinceSale: sale.daysSince,
    windowDays: policy.windowDays,
    voucherAmount,
    voucherCap: policy.voucherSellerCap,
  });

  return {
    saleId: sale.id,
    saleNumber: sale.number,
    daysSinceSale: sale.daysSince,
    windowDays: policy.windowDays,
    outOfWindow: sale.outOfWindow,
    lines: quotedLines,
    valueReturned,
    resolution: resolution.kind,
    refund,
    voucherAmount,
    exchange,
    voucherCap: policy.voucherSellerCap,
    suggestedRefundMethod: sale.suggestedRefundMethod,
    refundDiffersFromOriginal: resolution.kind === "DINERO" && resolution.method !== sale.suggestedRefundMethod,
    approval: { required: ctx.actorRole === "VENDEDORA" && need.type !== null, type: need.type, reasons: need.reasons },
    binding: returnBinding({ saleId: sale.id, locationId: location.id, lines, resolution }),
    cashOpen: ctx.cashOpen,
    warnings,
  };
}

/**
 * Cotiza una devolución o cambio SIN ejecutarla (para mostrar el resumen y decidir si hace falta la aprobación de Belén).
 * VENDEDORA: solo en su ubicación; ADMIN: tienda o bodega. La venta original puede ser de cualquier ubicación.
 */
export async function quoteReturn(input: {
  actor: Actor;
  locationId: string;
  saleId: string;
  lines: ReturnLineInput[];
  resolution: ReturnResolutionInput;
  now?: Date;
}): Promise<ReturnQuote> {
  assertAccess(input.actor, { roles: ["ADMIN", "VENDEDORA"], locationId: input.locationId });
  const data = parseInput(quoteReturnSchema, input);
  const location = await db.location.findFirst({ where: { id: data.locationId, active: true }, select: { id: true, name: true, sellsPos: true } });
  if (!location) throw new AppError("NOT_FOUND", "La ubicación no existe o está inactiva.");
  const sale = await loadSaleForReturn(db, data.saleId, input.now);
  const policy = await getReturnPolicy(db);
  const priced = data.resolution.kind === "CAMBIO" ? await priceNewLines(db, data.resolution.newLines) : null;
  const cashOpen = (await db.cashSession.count({ where: { locationId: data.locationId, status: "ABIERTA" } })) > 0;
  return buildQuote({ sale, location, actorRole: input.actor.role, policy, lines: data.lines, resolution: data.resolution, priced, cashOpen });
}
