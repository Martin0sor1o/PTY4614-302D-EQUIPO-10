import { daysBetweenKeys, santiagoDayKey } from "@/lib/dates";
import { assertClp, roundCash } from "@/lib/money";
import { daysText } from "./texts";

// Cálculos de devoluciones y cambios: FUNCIONES PURAS (regla 6: dinero en CLP enteros). Sin BD, sin Node.
// El servidor recalcula todo al ejecutar; el navegador solo los usa para mostrar.

/**
 * Valor devuelto por `returning` unidades de una línea: lo efectivamente pagado (línea con su descuento), prorrateado.
 * Es la parte acumulada de las unidades ya devueltas más estas menos la de las ya devueltas, con piso al peso, así que la
 * suma de todas las devoluciones parciales de una línea es EXACTAMENTE su total (sin pesos que sobran ni faltan).
 */
export function proratedAmount(lineTotal: number, quantity: number, alreadyReturned: number, returning: number): number {
  assertClp(lineTotal, "total de la línea");
  if (!Number.isInteger(quantity) || quantity <= 0) throw new RangeError(`cantidad vendida inválida: ${quantity}`);
  if (!Number.isInteger(alreadyReturned) || alreadyReturned < 0) throw new RangeError(`cantidad ya devuelta inválida: ${alreadyReturned}`);
  if (!Number.isInteger(returning) || returning <= 0) throw new RangeError(`cantidad a devolver inválida: ${returning}`);
  if (alreadyReturned + returning > quantity) throw new RangeError("se devuelve más de lo vendido");
  const upTo = (units: number) => Math.floor((lineTotal * units) / quantity);
  return upTo(alreadyReturned + returning) - upTo(alreadyReturned);
}

/** Días calendario (hora de Chile) entre la venta (o la entrega) y hoy. */
export function daysSince(from: Date, now: Date = new Date()): number {
  return daysBetweenKeys(santiagoDayKey(from), santiagoDayKey(now));
}

export const isOutOfWindow = (days: number, windowDays: number): boolean => days > windowDays;

export type MoneyRefundMethod = "EFECTIVO" | "TRANSFERENCIA" | "ANULACION_TRANSBANK";

export interface RefundQuote {
  /** Dinero que sale: en efectivo, ya redondeado a $10 (S-06). */
  amount: number;
  /** amount − valor devuelto. */
  roundingAdjustment: number;
}

export function quoteRefund(valueReturned: number, method: MoneyRefundMethod): RefundQuote {
  assertClp(valueReturned, "valor devuelto");
  if (method !== "EFECTIVO") return { amount: valueReturned, roundingAdjustment: 0 };
  const { rounded, adjustment } = roundCash(valueReturned);
  return { amount: rounded, roundingAdjustment: adjustment };
}

/** Medio sugerido para el reembolso: el original (S-06). Efectivo → efectivo; tarjeta → anulación en la máquina; transferencia → transferencia. */
export function suggestRefundMethod(paymentMethods: readonly string[]): MoneyRefundMethod {
  const main = paymentMethods.find((m) => m !== "VALE");
  if (main === "DEBITO" || main === "CREDITO") return "ANULACION_TRANSBANK";
  if (main === "TRANSFERENCIA") return "TRANSFERENCIA";
  return "EFECTIVO";
}

export interface ExchangeSplit {
  /** Lo que cubre el vale del cambio (lo devuelto, hasta el total nuevo). */
  voucherUsed: number;
  /** Diferencia a pagar por la clienta con un medio de pago. */
  toPay: number;
  /** Saldo a favor que queda en el vale. */
  leftover: number;
}

/** S-05: el valor devuelto se vuelve un vale que se canjea al instante en la venta nueva. */
export function splitExchange(valueReturned: number, newTotal: number): ExchangeSplit {
  assertClp(valueReturned, "valor devuelto");
  assertClp(newTotal, "total del cambio");
  const voucherUsed = Math.min(valueReturned, newTotal);
  return { voucherUsed, toPay: newTotal - voucherUsed, leftover: valueReturned - voucherUsed };
}

export type ReturnApprovalType = "REEMBOLSO" | "CAMBIO_FUERA_PLAZO" | "VALE_SOBRE_TOPE";

export interface ApprovalNeed {
  /** Tipo de la ÚNICA aprobación que cubre toda la operación; null si la vendedora puede hacerla sola. */
  type: ReturnApprovalType | null;
  /** Todos los motivos que aplican (Belén los ve en la tarjeta). */
  reasons: string[];
}

/**
 * ¿Necesita la aprobación de Belén? (solo se consulta para una VENDEDORA; el ADMIN opera directo, regla 10b).
 * Una sola aprobación por operación, del primer tipo que aplica: dinero → REEMBOLSO; si no, fuera de plazo →
 * CAMBIO_FUERA_PLAZO; si no, vale (o saldo a favor) sobre el tope → VALE_SOBRE_TOPE.
 */
export function approvalNeed(input: {
  isMoneyRefund: boolean;
  outOfWindow: boolean;
  daysSinceSale: number;
  windowDays: number;
  voucherAmount: number;
  voucherCap: number;
}): ApprovalNeed {
  const reasons: string[] = [];
  if (input.isMoneyRefund) reasons.push("Reembolso en dinero (RN-15)");
  if (input.outOfWindow) reasons.push(`Fuera de plazo: ${daysText(input.daysSinceSale)} desde la venta (plazo ${input.windowDays})`);
  if (input.voucherAmount > input.voucherCap) reasons.push(`Vale de $${input.voucherAmount.toLocaleString("es-CL")} sobre el tope de la vendedora ($${input.voucherCap.toLocaleString("es-CL")})`);
  const type: ReturnApprovalType | null = input.isMoneyRefund
    ? "REEMBOLSO"
    : input.outOfWindow
      ? "CAMBIO_FUERA_PLAZO"
      : input.voucherAmount > input.voucherCap
        ? "VALE_SOBRE_TOPE"
        : null;
  return { type, reasons };
}
