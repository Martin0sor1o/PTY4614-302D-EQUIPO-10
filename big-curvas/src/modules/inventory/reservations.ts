import type { Tx } from "@/lib/db";
import { assertAccess } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { lineKey } from "@/lib/idempotency";
import { parseInput } from "@/lib/validation";
import { MovementType, RefType, ReservationStatus } from "@/generated/prisma/client";
import { assertVariantsExist, getActiveLocation, insufficientStock, recordMovement } from "./internal";
import { compareStockKeys, groupByStockKey } from "./lines";
import { consumeSchema, releaseSchema, reserveSchema } from "./schemas";
import { reserveAvailable, takeReserved, unreserve } from "./stock-sql";
import type { Actor, MovementRecord, ReservationRecord, StockOperationResult } from "./types";

// Reservas (pedidos online). Invariante: SUM(quantity de reservas ACTIVA) por (variante, ubicación) = reserved.
//
// Orden de bloqueo en release/consume, en dos fases:
//   1) filas de `reservations` (cambio de estado condicional ACTIVA → …), ordenadas por (location, variant, id);
//   2) filas de `stock_levels`, agrupadas y ordenadas por (location, variant).
// Así toda transacción bloquea en el mismo orden global (traspaso → reservas → stock) y no hay deadlocks,
// aunque una misma operación traiga varias reservas de la misma variante.

const reservationSelect = {
  id: true,
  variantId: true,
  locationId: true,
  quantity: true,
  status: true,
  orderLineId: true,
  expiresAt: true,
} as const;

/**
 * Reserva DISPONIBLE (no mueve on_hand). Lo llama orders dentro de su transacción. Solo ADMIN registra pedidos.
 * Devuelve las reservas en el mismo orden de las líneas recibidas.
 */
export async function reserve(
  tx: Tx,
  input: {
    actor: Actor;
    lines: { variantId: string; locationId: string; qty: number; orderLineId?: string }[];
    expiresAt?: Date | null;
  },
): Promise<ReservationRecord[]> {
  const { lines, expiresAt } = parseInput(reserveSchema, input);
  for (const locationId of new Set(lines.map((l) => l.locationId))) {
    assertAccess(input.actor, { roles: ["ADMIN"], locationId });
    await getActiveLocation(tx, locationId);
  }
  await assertVariantsExist(tx, lines.map((l) => l.variantId));

  const order = lines.map((line, index) => ({ line, index })).sort((a, b) => compareStockKeys(a.line, b.line));
  const result: ReservationRecord[] = new Array(lines.length);
  for (const { line, index } of order) {
    const row = await reserveAvailable(tx, line.variantId, line.locationId, line.qty);
    if (!row) throw await insufficientStock(tx, line.variantId, line.locationId, line.qty);
    result[index] = await tx.reservation.create({
      data: {
        variantId: line.variantId,
        locationId: line.locationId,
        quantity: line.qty,
        status: ReservationStatus.ACTIVA,
        orderLineId: line.orderLineId ?? null,
        expiresAt: expiresAt ?? null,
        createdBy: input.actor.id,
      },
      select: reservationSelect,
    });
  }
  return result;
}

type LockedReservation = { id: string; variantId: string; locationId: string; quantity: number };

/**
 * Fase 1: pasa cada reserva de ACTIVA a `status` con un UPDATE condicional (WHERE status = 'ACTIVA').
 * Si otra transacción ya la cerró, afecta 0 filas → CONFLICT (evita consumir o liberar dos veces).
 */
async function closeReservations(
  tx: Tx,
  reservationIds: string[],
  status: ReservationStatus,
  releasedReason: string | null,
  checkAccess: (r: LockedReservation) => Promise<void>,
): Promise<LockedReservation[]> {
  const unique = [...new Set(reservationIds)];
  const rows = await tx.reservation.findMany({
    where: { id: { in: unique } },
    select: { id: true, variantId: true, locationId: true, quantity: true },
  });
  if (rows.length !== unique.length) throw new AppError("NOT_FOUND", "Una o más reservas no existen.");
  for (const r of rows) await checkAccess(r);

  rows.sort((a, b) => compareStockKeys(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const closedAt = new Date();
  for (const r of rows) {
    const { count } = await tx.reservation.updateMany({
      where: { id: r.id, status: ReservationStatus.ACTIVA },
      data: { status, closedAt, releasedReason },
    });
    if (count === 0) throw new AppError("CONFLICT", "La reserva ya no está activa (fue liberada, consumida o traspasada).", { reservationId: r.id });
  }
  return rows;
}

/** Libera reservas (reserved −= qty). Solo ADMIN (cancelación de pedido o corrección). */
export async function releaseReservations(
  tx: Tx,
  input: { actor: Actor; reservationIds: string[]; reason: string },
): Promise<{ releasedIds: string[] }> {
  const { reservationIds, reason } = parseInput(releaseSchema, input);
  const rows = await closeReservations(tx, reservationIds, ReservationStatus.LIBERADA, reason, async (r) =>
    assertAccess(input.actor, { roles: ["ADMIN"], locationId: r.locationId }),
  );
  for (const key of groupByStockKey(rows.map((r) => ({ ...r, qty: r.quantity })))) {
    const row = await unreserve(tx, key.variantId, key.locationId, key.qty);
    if (!row) throw new AppError("CONFLICT", "El reservado de stock no cuadra con las reservas activas.", { ...key });
  }
  return { releasedIds: rows.map((r) => r.id) };
}

/**
 * Picking de un pedido online: consume reservas (on_hand −= qty, reserved −= qty) con movimiento VENTA_ONLINE.
 * Solo en ubicaciones que despachan online (BODEGA). ADMIN o BODEGA de esa ubicación.
 */
export async function consumeReservations(
  tx: Tx,
  input: { actor: Actor; reservationIds: string[]; onlineOrderId?: string; idempotencyKey: string },
): Promise<StockOperationResult> {
  const { reservationIds, onlineOrderId, idempotencyKey } = parseInput(consumeSchema, input);
  const rows = await closeReservations(tx, reservationIds, ReservationStatus.CONSUMIDA, null, async (r) => {
    assertAccess(input.actor, { roles: ["ADMIN", "BODEGA"], locationId: r.locationId });
    const location = await getActiveLocation(tx, r.locationId);
    if (!location.fulfillsOnline) {
      throw new AppError("VALIDATION", `Los pedidos online solo se preparan en bodega (la reserva está en ${location.name}).`);
    }
  });

  const movements: MovementRecord[] = [];
  for (const [n, key] of groupByStockKey(rows.map((r) => ({ ...r, qty: r.quantity }))).entries()) {
    const row = await takeReserved(tx, key.variantId, key.locationId, key.qty);
    if (!row) throw new AppError("CONFLICT", "El reservado de stock no cuadra con las reservas activas.", { ...key });
    movements.push(
      await recordMovement(tx, {
        variantId: key.variantId,
        locationId: key.locationId,
        type: MovementType.VENTA_ONLINE,
        quantity: -key.qty,
        onHandAfter: row.onHand,
        at: row.at,
        refType: RefType.ONLINE_ORDER,
        refId: onlineOrderId,
        userId: input.actor.id,
        idempotencyKey: lineKey(idempotencyKey, n),
      }),
    );
  }
  return { movements };
}
