import type { Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { MovementType, RefType } from "@/generated/prisma/client";
import type { MovementRecord } from "./types";

// Utilidades internas del módulo inventory (no se exportan desde index.ts).

export const movementSelect = {
  id: true,
  variantId: true,
  locationId: true,
  type: true,
  quantity: true,
  onHandAfter: true,
  refType: true,
  refId: true,
  idempotencyKey: true,
  createdAt: true,
} as const;

/**
 * INSERT del movimiento (inmutable, regla 2) en la misma transacción que cambió stock_levels.
 * `at` es el clock_timestamp() devuelto por el UPDATE: ordena el kardex igual que los saldos.
 */
export function recordMovement(
  tx: Tx,
  m: {
    variantId: string;
    locationId: string;
    type: MovementType;
    quantity: number;
    onHandAfter: number;
    at: Date;
    refType: RefType;
    refId?: string | null;
    reason?: string | null;
    userId: string;
    idempotencyKey: string;
  },
): Promise<MovementRecord> {
  return tx.inventoryMovement.create({
    data: {
      variantId: m.variantId,
      locationId: m.locationId,
      type: m.type,
      quantity: m.quantity,
      onHandAfter: m.onHandAfter,
      refType: m.refType,
      refId: m.refId ?? null,
      reason: m.reason ?? null,
      userId: m.userId,
      idempotencyKey: m.idempotencyKey,
      createdAt: m.at,
    },
    select: movementSelect,
  });
}

export interface LocationInfo {
  id: string;
  code: string;
  name: string;
  sellsPos: boolean;
  fulfillsOnline: boolean;
}

export async function getActiveLocation(tx: Tx, locationId: string): Promise<LocationInfo> {
  const loc = await tx.location.findFirst({
    where: { id: locationId, active: true },
    select: { id: true, code: true, name: true, sellsPos: true, fulfillsOnline: true },
  });
  if (!loc) throw new AppError("NOT_FOUND", "La ubicación no existe o está inactiva.", { locationId });
  return loc;
}

/** Verifica que todas las variantes existan (antes de un UPSERT, para no chocar con la FK a mitad de la operación). */
export async function assertVariantsExist(tx: Tx, variantIds: readonly string[]): Promise<void> {
  const unique = [...new Set(variantIds)];
  const found = await tx.productVariant.count({ where: { id: { in: unique } } });
  if (found !== unique.length) throw new AppError("NOT_FOUND", "Una o más prendas no existen.", { variantIds: unique });
}

/**
 * Arma el error STOCK_INSUFICIENTE con datos legibles. Se llama DESPUÉS de que el UPDATE condicional no
 * afectó filas: esta lectura es solo para el mensaje, no para decidir.
 */
export async function insufficientStock(tx: Tx, variantId: string, locationId: string, requested: number): Promise<AppError> {
  const variant = await tx.productVariant.findUnique({ where: { id: variantId }, select: { sku: true } });
  if (!variant) return new AppError("NOT_FOUND", "La prenda no existe.", { variantId });
  const location = await tx.location.findUnique({ where: { id: locationId }, select: { name: true } });
  const level = await tx.stockLevel.findUnique({
    where: { variantId_locationId: { variantId, locationId } },
    select: { onHand: true, reserved: true },
  });
  const onHand = level?.onHand ?? 0;
  const reserved = level?.reserved ?? 0;
  const available = onHand - reserved;
  const reservedNote = reserved > 0 ? ` (${reserved} reservada${reserved === 1 ? "" : "s"} para pedidos)` : "";
  return new AppError(
    "STOCK_INSUFICIENTE",
    `Stock insuficiente de ${variant.sku} en ${location?.name ?? "la ubicación"}: disponible ${available}${reservedNote}, solicitado ${requested}.`,
    { variantId, locationId, sku: variant.sku, requested, available, onHand, reserved },
  );
}
