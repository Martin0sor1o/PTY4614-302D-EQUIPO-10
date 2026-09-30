// Idempotencia de operaciones (CLAUDE.md regla 8). Lógica genérica, sin BD: el módulo dueño de la
// operación entrega cómo buscar el resultado ya guardado y cómo ejecutarla (su propia $transaction).

export interface IdempotentResult<T> {
  result: T;
  /** true si la operación ya existía y se devolvió el resultado guardado sin volver a ejecutarla. */
  replayed: boolean;
}

/**
 * Ejecuta `execute` una sola vez por clave.
 *
 * 1. Si `find` ya encuentra el resultado → se devuelve sin ejecutar.
 * 2. Si no, se ejecuta la transacción. Cuando otra petición con la misma clave gana la carrera, el INSERT
 *    con la clave única falla (P2002) y Postgres ABORTA la transacción: por eso el error se captura aquí,
 *    FUERA del $transaction, y el resultado se lee con una consulta nueva.
 * 3. Se relee ante CUALQUIER error, no solo P2002: si la otra petición se llevó la última unidad, esta falla
 *    con STOCK_INSUFICIENTE antes de llegar al INSERT, pero para el cliente es la misma operación ya hecha.
 *    Si tras el error no hay resultado guardado, el error era real y se propaga.
 */
export async function runIdempotent<T>(op: {
  find: () => Promise<T | null>;
  execute: () => Promise<T>;
}): Promise<IdempotentResult<T>> {
  const existing = await op.find();
  if (existing !== null) return { result: existing, replayed: true };

  try {
    return { result: await op.execute(), replayed: false };
  } catch (error) {
    const saved = await op.find();
    if (saved !== null) return { result: saved, replayed: true };
    throw error;
  }
}

/** Clave de cada movimiento de una operación: `{clave}:{n}`, con n = índice de la línea ya ordenada (determinístico). */
export function lineKey(operationKey: string, index: number): string {
  return `${operationKey}:${index}`;
}
