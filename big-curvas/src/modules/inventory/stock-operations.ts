import type { Tx } from "@/lib/db";
import { assertAccess } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { lineKey } from "@/lib/idempotency";
import { parseInput } from "@/lib/validation";
import { MovementType, RefType } from "@/generated/prisma/client";
import { assertVariantsExist, getActiveLocation, insufficientStock, recordMovement } from "./internal";
import { normalizeLines } from "./lines";
import {
  adjustSchema,
  loadInitialStockSchema,
  lockStockSchema,
  receiveSchema,
  returnOrderSchema,
  returnToStockSchema,
  reverseSaleSchema,
  sellSchema,
  writeOffSchema,
} from "./schemas";
import { addOnHand, lockStockRows, takeAvailable } from "./stock-sql";
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

/**
 * Anulación de una venta POS (RN-12): la prenda vuelve al stock de la tienda con movimiento inverso ANULACION_VENTA
 * (la venta nunca se borra). Lo llama sales dentro de la transacción de la anulación, con la aprobación ya consumida
 * o por el ADMIN directamente. La vendedora solo repone en su tienda.
 */
export async function reverseSale(
  tx: Tx,
  input: WithActor<{ locationId: string; lines: { variantId: string; qty: number }[]; saleId: string; reason: string; idempotencyKey: string }>,
): Promise<StockOperationResult> {
  const { locationId, lines, saleId, reason, idempotencyKey } = parseInput(reverseSaleSchema, input);
  assertAccess(input.actor, { roles: ["ADMIN", "VENDEDORA"], locationId });
  const location = await getActiveLocation(tx, locationId);
  if (!location.sellsPos) throw new AppError("VALIDATION", `${location.name} no vende en POS.`);
  const sorted = normalizeLines(lines);
  await assertVariantsExist(tx, sorted.map((l) => l.variantId));

  const movements: MovementRecord[] = [];
  for (const [n, line] of sorted.entries()) {
    const row = await addOnHand(tx, line.variantId, locationId, line.qty);
    movements.push(
      await recordMovement(tx, {
        variantId: line.variantId,
        locationId,
        type: MovementType.ANULACION_VENTA,
        quantity: line.qty,
        onHandAfter: row.onHand,
        at: row.at,
        refType: RefType.SALE,
        refId: saleId,
        reason,
        userId: input.actor.id,
        idempotencyKey: lineKey(idempotencyKey, n),
      }),
    );
  }
  return { movements };
}

/**
 * Reingreso de un pedido online cancelado que ya estaba PREPARADO (RF-PED-09): la prenda ya salió del stock con
 * VENTA_ONLINE y vuelve a la bodega con REINGRESO_PEDIDO_CANCELADO. Solo ADMIN y solo donde se despacha online.
 */
export async function returnOrderToStock(
  tx: Tx,
  input: WithActor<{
    locationId: string;
    onlineOrderId: string;
    lines: { variantId: string; qty: number }[];
    reason: string;
    idempotencyKey: string;
  }>,
): Promise<StockOperationResult> {
  const { locationId, onlineOrderId, lines, reason, idempotencyKey } = parseInput(returnOrderSchema, input);
  assertAccess(input.actor, { roles: ["ADMIN"], locationId });
  const location = await getActiveLocation(tx, locationId);
  if (!location.fulfillsOnline) {
    throw new AppError("VALIDATION", `Los pedidos online solo se reingresan en bodega (${location.name} no despacha online).`);
  }
  const sorted = normalizeLines(lines);
  await assertVariantsExist(tx, sorted.map((l) => l.variantId));

  const movements: MovementRecord[] = [];
  for (const [n, line] of sorted.entries()) {
    const row = await addOnHand(tx, line.variantId, locationId, line.qty);
    movements.push(
      await recordMovement(tx, {
        variantId: line.variantId,
        locationId,
        type: MovementType.REINGRESO_PEDIDO_CANCELADO,
        quantity: line.qty,
        onHandAfter: row.onHand,
        at: row.at,
        refType: RefType.ONLINE_ORDER,
        refId: onlineOrderId,
        reason,
        userId: input.actor.id,
        idempotencyKey: lineKey(idempotencyKey, n),
      }),
    );
  }
  return { movements };
}

const RETURN_ROLES = ["ADMIN", "VENDEDORA", "BODEGA"] as const;

/**
 * Devolución o cambio (ADR-021, RN-24): la prenda que vuelve entra al stock de la ubicación QUE LA RECIBE, con movimiento
 * DEVOLUCION (+qty, ref RETURN). Lo llama `returns` dentro de su transacción. La vendedora y la bodega solo operan en la
 * suya; el ADMIN en cualquiera. No exige que la ubicación venda en POS: Belén también recibe devoluciones en la bodega.
 */
export async function returnToStock(
  tx: Tx,
  input: WithActor<{ locationId: string; lines: { variantId: string; qty: number }[]; returnId: string; reason?: string; idempotencyKey: string }>,
): Promise<StockOperationResult> {
  const { locationId, lines, returnId, reason, idempotencyKey } = parseInput(returnToStockSchema, input);
  assertAccess(input.actor, { roles: RETURN_ROLES, locationId });
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
        type: MovementType.DEVOLUCION,
        quantity: line.qty,
        onHandAfter: row.onHand,
        at: row.at,
        refType: RefType.RETURN,
        refId: returnId,
        reason: reason ?? "Devolución de cliente",
        userId: input.actor.id,
        idempotencyKey: lineKey(idempotencyKey, n),
      }),
    );
  }
  return { movements };
}

/**
 * Merma de una prenda devuelta en mal estado (RN-11): sale del stock vendible con movimiento MERMA (−qty, ref RETURN).
 * Descuenta solo lo DISPONIBLE (nunca lo reservado para pedidos). En una devolución de prenda dañada `returns` la llama
 * justo después de `returnToStock`: el stock queda igual y los dos movimientos dejan la historia completa.
 */
export async function writeOff(
  tx: Tx,
  input: WithActor<{ locationId: string; lines: { variantId: string; qty: number }[]; returnId: string; reason: string; idempotencyKey: string }>,
): Promise<StockOperationResult> {
  const { locationId, lines, returnId, reason, idempotencyKey } = parseInput(writeOffSchema, input);
  assertAccess(input.actor, { roles: RETURN_ROLES, locationId });
  await getActiveLocation(tx, locationId);
  const sorted = normalizeLines(lines);
  await assertVariantsExist(tx, sorted.map((l) => l.variantId));

  const movements: MovementRecord[] = [];
  for (const [n, line] of sorted.entries()) {
    const row = await takeAvailable(tx, line.variantId, locationId, line.qty);
    if (!row) throw await insufficientStock(tx, line.variantId, locationId, line.qty);
    movements.push(
      await recordMovement(tx, {
        variantId: line.variantId,
        locationId,
        type: MovementType.MERMA,
        quantity: -line.qty,
        onHandAfter: row.onHand,
        at: row.at,
        refType: RefType.RETURN,
        refId: returnId,
        reason,
        userId: input.actor.id,
        idempotencyKey: lineKey(idempotencyKey, n),
      }),
    );
  }
  return { movements };
}

/**
 * Bloqueo previo de filas de stock en orden canónico (ubicación, variante), para una transacción que toca VARIOS
 * conjuntos de variantes (un cambio: lo que entra y lo que sale). No cambia cantidades ni deja movimientos; solo crea con
 * 0 las filas que falten y las bloquea. El actor debe poder operar en cada ubicación tocada.
 */
export async function lockStock(tx: Tx, input: { actor: Actor; keys: { locationId: string; variantId: string }[] }): Promise<void> {
  const { keys } = parseInput(lockStockSchema, input);
  for (const locationId of new Set(keys.map((k) => k.locationId))) {
    assertAccess(input.actor, { roles: RETURN_ROLES, locationId });
  }
  await assertVariantsExist(tx, keys.map((k) => k.variantId));
  await lockStockRows(tx, keys);
}
