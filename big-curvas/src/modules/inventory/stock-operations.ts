import type { Tx } from "@/lib/db";
import { assertAccess } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { lineKey } from "@/lib/idempotency";
import { parseInput } from "@/lib/validation";
import { MovementType, RefType } from "@/generated/prisma/client";
import { assertVariantsExist, getActiveLocation, insufficientStock, recordMovement } from "./internal";
import { normalizeLines } from "./lines";
import { adjustSchema, loadInitialStockSchema, receiveSchema, sellSchema } from "./schemas";
import { addOnHand, takeAvailable } from "./stock-sql";
import type { Actor, MovementRecord, StockOperationResult } from "./types";

// Operaciones de stock de UNA ubicación. Todas reciben el `tx` de quien llama (regla: sales/orders pasan el
// suyo) y validan rol + ubicación del actor. Líneas agrupadas y ordenadas por variant_id antes de bloquear.

type WithActor<T> = T & { actor: Actor };

/** Carga inicial por conteo (RF-INV-06). Solo ADMIN. Con qty 0 solo crea la fila de stock (sin movimiento). */
export async function loadInitialStock(
  tx: Tx,
  input: WithActor<{ locationId: string; lines: { variantId: string; qty: number }[]; idempotencyKey: string }>,
): Promise<StockOperationResult> {
  const { locationId, lines, idempotencyKey } = parseInput(loadInitialStockSchema, input);
  assertAccess(input.actor, { roles: ["ADMIN"], locationId });
  await getActiveLocation(tx, locationId);
  const sorted = normalizeLines(lines);
  await assertVariantsExist(tx, sorted.map((l) => l.variantId));

  const movements: MovementRecord[] = [];
  for (const [n, line] of sorted.entries()) {
    const row = await addOnHand(tx, line.variantId, locationId, line.qty);
    if (line.qty === 0) continue;
    movements.push(
      await recordMovement(tx, {
        variantId: line.variantId,
        locationId,
        type: MovementType.CARGA_INICIAL,
        quantity: line.qty,
        onHandAfter: row.onHand,
        at: row.at,
        refType: RefType.MANUAL,
        reason: "Carga inicial",
        userId: input.actor.id,
        idempotencyKey: lineKey(idempotencyKey, n),
      }),
    );
  }
  return { movements };
}

/** Recepción de proveedor (RF-INV-04): ADMIN en cualquier ubicación; vendedora y bodega solo en la suya. */
export async function receive(
  tx: Tx,
  input: WithActor<{
    locationId: string;
    lines: { variantId: string; qty: number }[];
    goodsReceiptId?: string;
    reason?: string;
    idempotencyKey: string;
  }>,
): Promise<StockOperationResult> {
  const { locationId, lines, goodsReceiptId, reason, idempotencyKey } = parseInput(receiveSchema, input);
  assertAccess(input.actor, { roles: ["ADMIN", "VENDEDORA", "BODEGA"], locationId });
  await getActiveLocation(tx, locationId);
  const sorted = normalizeLines(lines);
  await assertVariantsExist(tx, sorted.map((l) => l.variantId));

  const movements: MovementRecord[] = [];
  for (const [n, line] of sorted.entries()) {
    const row = await addOnHand(tx, line.variantId, locationId, line.qty);
    movements.push(
      await recordMovement(tx, {
        variantId: line.variantId,
        locationId,
        type: MovementType.RECEPCION,
        quantity: line.qty,
        onHandAfter: row.onHand,
        at: row.at,
        refType: goodsReceiptId ? RefType.GOODS_RECEIPT : RefType.MANUAL,
        refId: goodsReceiptId,
        reason: reason ?? "Recepción de mercadería",
        userId: input.actor.id,
        idempotencyKey: lineKey(idempotencyKey, n),
      }),
    );
  }
  return { movements };
}

/**
 * Ajuste manual con motivo obligatorio (RF-INV-03, solo ADMIN). Un ajuste negativo solo puede descontar
 * lo DISPONIBLE: no toca unidades reservadas para pedidos. Queda en audit_log (acción sensible, regla 9).
 */
export async function adjust(
  tx: Tx,
  input: WithActor<{ locationId: string; variantId: string; delta: number; reason: string; idempotencyKey: string }>,
): Promise<StockOperationResult> {
  const { locationId, variantId, delta, reason, idempotencyKey } = parseInput(adjustSchema, input);
  assertAccess(input.actor, { roles: ["ADMIN"], locationId });
  await getActiveLocation(tx, locationId);
  await assertVariantsExist(tx, [variantId]);

  let row;
  if (delta < 0) {
    row = await takeAvailable(tx, variantId, locationId, -delta);
    if (!row) throw await insufficientStock(tx, variantId, locationId, -delta);
  } else {
    row = await addOnHand(tx, variantId, locationId, delta);
  }

  const movement = await recordMovement(tx, {
    variantId,
    locationId,
    type: MovementType.AJUSTE,
    quantity: delta,
    onHandAfter: row.onHand,
    at: row.at,
    refType: RefType.MANUAL,
    reason,
    userId: input.actor.id,
    idempotencyKey: lineKey(idempotencyKey, 0),
  });
  await tx.auditLog.create({
    data: {
      userId: input.actor.id,
      locationId,
      action: "STOCK_ADJUST",
      entity: "stock_level",
      entityId: `${variantId}:${locationId}`,
      before: { onHand: row.onHand - delta },
      after: { onHand: row.onHand, delta, reason, movementId: movement.id },
    },
  });
  return { movements: [movement] };
}

/**
 * Venta POS: descuenta del DISPONIBLE de la tienda. Lo llama sales dentro de su transacción.
 * Si cualquier línea no alcanza → STOCK_INSUFICIENTE y se revierte la transacción completa.
 */
export async function sell(
  tx: Tx,
  input: WithActor<{ locationId: string; lines: { variantId: string; qty: number }[]; saleId: string; idempotencyKey: string }>,
): Promise<StockOperationResult> {
  const { locationId, lines, saleId, idempotencyKey } = parseInput(sellSchema, input);
  assertAccess(input.actor, { roles: ["ADMIN", "VENDEDORA"], locationId });
  const location = await getActiveLocation(tx, locationId);
  if (!location.sellsPos) throw new AppError("VALIDATION", `${location.name} no vende en POS.`);

  const movements: MovementRecord[] = [];
  for (const [n, line] of normalizeLines(lines).entries()) {
    const row = await takeAvailable(tx, line.variantId, locationId, line.qty);
    if (!row) throw await insufficientStock(tx, line.variantId, locationId, line.qty);
    movements.push(
      await recordMovement(tx, {
        variantId: line.variantId,
        locationId,
        type: MovementType.VENTA_POS,
        quantity: -line.qty,
        onHandAfter: row.onHand,
        at: row.at,
        refType: RefType.SALE,
        refId: saleId,
        userId: input.actor.id,
        idempotencyKey: lineKey(idempotencyKey, n),
      }),
    );
  }
  return { movements };
}
