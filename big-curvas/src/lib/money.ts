// Dinero en CLP: siempre enteros (Int). Prohibido float/Decimal para montos (CLAUDE.md regla 6).
// Precios con IVA incluido. Descuentos % en puntos básicos (bps): 1000 bps = 10 %.

export const BPS_DENOMINATOR = 10_000;

export function isClp(value: number): boolean {
  return Number.isSafeInteger(value);
}

export function assertClp(value: number, label = "monto"): number {
  if (!isClp(value)) {
    throw new RangeError(`${label} debe ser un entero CLP, recibido: ${value}`);
  }
  return value;
}

/** Formato chileno: 12990 → "$12.990"; -500 → "-$500". */
export function formatCLP(amount: number): string {
  assertClp(amount);
  const digits = Math.abs(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${amount < 0 ? "-" : ""}$${digits}`;
}

/** "$12.990", "12.990" o "12990" → 12990. Devuelve null si no es un entero válido. */
export function parseCLP(input: string): number | null {
  const cleaned = input.trim().replace(/[$\s.]/g, "");
  if (!/^-?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return isClp(n) ? n : null;
}

/**
 * Descuento en CLP de un monto según puntos básicos, con aritmética entera
 * (redondeo half-up al peso). 10_000 × 1000 bps → 1_000.
 */
export function discountFromBps(amount: number, bps: number): number {
  assertClp(amount);
  if (!Number.isInteger(bps) || bps < 0 || bps > BPS_DENOMINATOR) {
    throw new RangeError(`bps fuera de rango (0–${BPS_DENOMINATOR}): ${bps}`);
  }
  return Math.floor((amount * bps + BPS_DENOMINATOR / 2) / BPS_DENOMINATOR);
}

/** Convierte un porcentaje ingresado por el usuario (ej. 10 o 12.5) a puntos básicos enteros. */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

export function bpsToPercent(bps: number): number {
  return bps / 100;
}

export interface CashRounding {
  /** Monto a cobrar en efectivo (múltiplo de $10). */
  rounded: number;
  /** rounded − amount. Negativo si se redondea hacia abajo (se guarda como `rounding_adjustment`). */
  adjustment: number;
}

/**
 * Redondeo de efectivo a $10 (Ley 20.956): terminaciones 1–5 bajan a la decena inferior,
 * 6–9 suben a la superior. Solo aplica a pagos en efectivo.
 * PENDIENTE: validar con el contador (docs/DEMO_PLAN.md).
 */
export function roundCash(amount: number): CashRounding {
  assertClp(amount);
  const remainder = ((amount % 10) + 10) % 10;
  const adjustment = remainder === 0 ? 0 : remainder <= 5 ? -remainder : 10 - remainder; // evita -0
  return { rounded: amount + adjustment, adjustment };
}

export function sumClp(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + assertClp(v), 0);
}
