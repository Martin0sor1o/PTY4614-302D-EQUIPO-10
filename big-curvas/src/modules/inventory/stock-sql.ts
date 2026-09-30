import type { Tx } from "@/lib/db";

// ÚNICO lugar que escribe stock_levels (CLAUDE.md reglas 1, 4 y 5). Uso interno del módulo inventory.
//
// Cada cambio es UNA sentencia atómica con la condición en el WHERE (nunca leer-calcular-guardar).
// El UPDATE deja la fila bloqueada hasta el COMMIT: una segunda transacción sobre la misma fila espera y,
// en READ COMMITTED, vuelve a evaluar el WHERE con el valor ya confirmado. Si no afecta filas → null.
// `RETURNING clock_timestamp()` da la hora en que se tomó el bloqueo: se usa como created_at del movimiento,
// así el kardex de una fila queda en el mismo orden que sus saldos (on_hand_after).

export interface StockRow {
  onHand: number;
  reserved: number;
  at: Date;
}

type RawRow = { on_hand: number; reserved: number; at: Date };

function first(rows: RawRow[]): StockRow | null {
  const r = rows[0];
  return r ? { onHand: r.on_hand, reserved: r.reserved, at: r.at } : null;
}

/** on_hand −= qty solo si hay disponible (on_hand − reserved ≥ qty). Venta, salida de traspaso, ajuste negativo. */
export async function takeAvailable(tx: Tx, variantId: string, locationId: string, qty: number): Promise<StockRow | null> {
  return first(
    await tx.$queryRaw<RawRow[]>`
      UPDATE stock_levels
      SET on_hand = on_hand - ${qty}, updated_at = now()
      WHERE variant_id = ${variantId} AND location_id = ${locationId}
        AND on_hand - reserved >= ${qty}
      RETURNING on_hand, reserved, clock_timestamp() AS at
    `,
  );
}

/**
 * on_hand += qty (y opcionalmente reserved += reserveQty). UPSERT: no depende de que la fila exista.
 * Carga inicial, recepción, entrada de traspaso. Con qty = 0 solo asegura que la fila exista.
 */
export async function addOnHand(
  tx: Tx,
  variantId: string,
  locationId: string,
  qty: number,
  reserveQty = 0,
): Promise<StockRow> {
  const row = first(
    await tx.$queryRaw<RawRow[]>`
      INSERT INTO stock_levels (variant_id, location_id, on_hand, reserved, updated_at)
      VALUES (${variantId}, ${locationId}, ${qty}, ${reserveQty}, now())
      ON CONFLICT (variant_id, location_id) DO UPDATE
      SET on_hand = stock_levels.on_hand + EXCLUDED.on_hand,
          reserved = stock_levels.reserved + EXCLUDED.reserved,
          updated_at = now()
      RETURNING on_hand, reserved, clock_timestamp() AS at
    `,
  );
  return row!; // un UPSERT siempre devuelve la fila
}

/** reserved += qty solo si hay disponible. */
export async function reserveAvailable(tx: Tx, variantId: string, locationId: string, qty: number): Promise<StockRow | null> {
  return first(
    await tx.$queryRaw<RawRow[]>`
      UPDATE stock_levels
      SET reserved = reserved + ${qty}, updated_at = now()
      WHERE variant_id = ${variantId} AND location_id = ${locationId}
        AND on_hand - reserved >= ${qty}
      RETURNING on_hand, reserved, clock_timestamp() AS at
    `,
  );
}

/** reserved −= qty (liberar una reserva). */
export async function unreserve(tx: Tx, variantId: string, locationId: string, qty: number): Promise<StockRow | null> {
  return first(
    await tx.$queryRaw<RawRow[]>`
      UPDATE stock_levels
      SET reserved = reserved - ${qty}, updated_at = now()
      WHERE variant_id = ${variantId} AND location_id = ${locationId}
        AND reserved >= ${qty}
      RETURNING on_hand, reserved, clock_timestamp() AS at
    `,
  );
}

/** on_hand −= qty y reserved −= qty (consumir una reserva: picking o salida de traspaso con reserva). */
export async function takeReserved(tx: Tx, variantId: string, locationId: string, qty: number): Promise<StockRow | null> {
  return first(
    await tx.$queryRaw<RawRow[]>`
      UPDATE stock_levels
      SET on_hand = on_hand - ${qty}, reserved = reserved - ${qty}, updated_at = now()
      WHERE variant_id = ${variantId} AND location_id = ${locationId}
        AND reserved >= ${qty} AND on_hand >= ${qty}
      RETURNING on_hand, reserved, clock_timestamp() AS at
    `,
  );
}
