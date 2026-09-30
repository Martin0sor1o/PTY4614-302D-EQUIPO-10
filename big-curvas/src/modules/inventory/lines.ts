// Orden canónico de bloqueo (CLAUDE.md regla 5 / arquitectura §5.1): toda operación toca las filas en orden
// (location_id, variant_id). Si dos transacciones bloquean siempre en el mismo orden, no hay deadlock.
// Se compara por unidades de código (no localeCompare) para que el orden no dependa del locale del servidor.

export interface StockKey {
  locationId: string;
  variantId: string;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareStockKeys(a: StockKey, b: StockKey): number {
  return cmp(a.locationId, b.locationId) || cmp(a.variantId, b.variantId);
}

/**
 * Suma las líneas repetidas de una misma variante y las ordena por variant_id (todas son de la misma ubicación).
 * El índice de cada línea en el resultado es el `n` de su clave de movimiento `{clave}:{n}`.
 */
export function normalizeLines<T extends { variantId: string; qty: number }>(lines: readonly T[]): { variantId: string; qty: number }[] {
  const byVariant = new Map<string, number>();
  for (const l of lines) byVariant.set(l.variantId, (byVariant.get(l.variantId) ?? 0) + l.qty);
  return [...byVariant.entries()].map(([variantId, qty]) => ({ variantId, qty })).sort((a, b) => cmp(a.variantId, b.variantId));
}

/** Agrupa cantidades por (ubicación, variante) y las devuelve en el orden canónico de bloqueo. */
export function groupByStockKey<T extends StockKey & { qty: number }>(items: readonly T[]): (StockKey & { qty: number })[] {
  const map = new Map<string, StockKey & { qty: number }>();
  for (const i of items) {
    const k = `${i.locationId}|${i.variantId}`;
    const acc = map.get(k);
    if (acc) acc.qty += i.qty;
    else map.set(k, { locationId: i.locationId, variantId: i.variantId, qty: i.qty });
  }
  return [...map.values()].sort(compareStockKeys);
}
