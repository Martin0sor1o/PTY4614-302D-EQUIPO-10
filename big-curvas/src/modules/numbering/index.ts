import type { Tx } from "@/lib/db";

// Correlativos atómicos por documento (tabla document_counters). Un solo UPSERT: dos transacciones
// concurrentes nunca obtienen el mismo número (la segunda espera el bloqueo de la fila del contador).

/** Siguiente número para `key`, formateado como `{prefix}-000123`. */
export async function nextDocumentNumber(tx: Tx, key: string, prefix: string): Promise<string> {
  const [row] = await tx.$queryRaw<{ last_value: number }[]>`
    INSERT INTO document_counters (key, last_value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET last_value = document_counters.last_value + 1
    RETURNING last_value
  `;
  return `${prefix}-${String(row.last_value).padStart(6, "0")}`;
}
