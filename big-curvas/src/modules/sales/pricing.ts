import { AppError } from "@/lib/errors";
import { assertClp, discountFromBps, roundCash, sumClp } from "@/lib/money";

// Precios, descuentos, redondeo de efectivo y cuadratura de caja: FUNCIONES PURAS (CLAUDE.md regla 6).
// Sin BD ni Next. Es el único lugar donde se calculan montos de una venta; el servidor los recalcula siempre
// y el navegador solo los usa para mostrar (el total del servidor manda).

/** Precio efectivo de una variante: `price_override ?? base_price` (precios con IVA, iguales en todas las tiendas). */
export function effectivePrice(variant: { priceOverride: number | null; basePrice: number }): number {
  return assertClp(variant.priceOverride ?? variant.basePrice, "precio");
}

export interface PricedLine {
  unitPrice: number;
  quantity: number;
  discountBps: number;
  /** unitPrice × quantity, antes del descuento. */
  gross: number;
  /** Descuento manual de la línea en CLP (half-up al peso). */
  discount: number;
  lineTotal: number;
}

/** Línea con descuento manual por línea en puntos básicos (1000 = 10 %). */
export function priceLine(input: { unitPrice: number; quantity: number; discountBps: number }): PricedLine {
  const { unitPrice, quantity, discountBps } = input;
  assertClp(unitPrice, "precio unitario");
  if (!Number.isInteger(quantity) || quantity <= 0) throw new RangeError(`cantidad inválida: ${quantity}`);
  if (unitPrice < 0) throw new RangeError(`precio unitario inválido: ${unitPrice}`);
  const gross = assertClp(unitPrice * quantity, "bruto de la línea");
  const discount = discountFromBps(gross, discountBps); // valida bps 0…10000
  return { unitPrice, quantity, discountBps, gross, discount, lineTotal: gross - discount };
}

export interface PricedSale {
  lines: PricedLine[];
  /** Σ brutos (antes de descuentos). */
  subtotal: number;
  discountTotal: number;
  /** subtotal − descuentos. Es el total de la venta (sin redondeo de efectivo). */
  total: number;
}

export function priceSale(lines: readonly { unitPrice: number; quantity: number; discountBps: number }[]): PricedSale {
  const priced = lines.map(priceLine);
  const subtotal = sumClp(priced.map((l) => l.gross));
  const discountTotal = sumClp(priced.map((l) => l.discount));
  return { lines: priced, subtotal, discountTotal, total: subtotal - discountTotal };
}

/** Un descuento por línea sobre el límite de la vendedora requiere aprobación (llega en la Etapa 6). */
export function isDiscountOverLimit(discountBps: number, limitBps: number): boolean {
  return discountBps > limitBps;
}

export function assertDiscountWithinLimit(discountBps: number, limitBps: number, label?: string): void {
  if (isDiscountOverLimit(discountBps, limitBps)) {
    throw new AppError("APROBACION_REQUERIDA", `Requiere aprobación de Belén${label ? ` (${label})` : ""}`, {
      discountBps,
      limitBps,
    });
  }
}

export type PaymentMethodCode = "EFECTIVO" | "DEBITO" | "CREDITO" | "TRANSFERENCIA";

export interface PaymentQuote {
  /** Lo que se cobra por este medio: total + ajuste. En efectivo es múltiplo de $10. */
  amount: number;
  /** `rounding_adjustment` de la venta: 0 salvo en efectivo (RN-19). */
  roundingAdjustment: number;
}

/** Redondeo a $10 SOLO en efectivo (RN-19: terminaciones 1–5 bajan, 6–9 suben; pendiente validar con el contador). */
export function quotePayment(total: number, method: PaymentMethodCode): PaymentQuote {
  assertClp(total, "total");
  if (method !== "EFECTIVO") return { amount: total, roundingAdjustment: 0 };
  const { rounded, adjustment } = roundCash(total);
  return { amount: rounded, roundingAdjustment: adjustment };
}

/** Vuelto = recibido − cobrado. Lanza si lo recibido no alcanza. */
export function changeFor(cashReceived: number, amountDue: number): number {
  assertClp(cashReceived, "monto recibido");
  assertClp(amountDue, "monto a cobrar");
  if (cashReceived < amountDue) throw new RangeError("El monto recibido es menor al total a cobrar.");
  return cashReceived - amountDue;
}

/**
 * Efectivo esperado al cierre = monto inicial + efectivo cobrado − vueltos. Cada pago en efectivo guardado ya es
 * NETO de vuelto y trae el redondeo (payments.amount = total + rounding_adjustment), así que basta sumarlos.
 */
export function expectedCash(openingCash: number, cashPaymentAmounts: readonly number[]): number {
  return assertClp(openingCash, "monto inicial") + sumClp(cashPaymentAmounts);
}

/** contado − esperado: negativo = falta plata en la caja; positivo = sobra. */
export function cashDifference(countedCash: number, expected: number): number {
  return assertClp(countedCash, "efectivo contado") - assertClp(expected, "efectivo esperado");
}
