import { db, type Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { TransferStatus } from "@/generated/prisma/client";
import { movementSelect } from "./internal";
import type { MovementRecord, MovementType, RefType } from "./types";

// Consultas de SOLO LECTURA. Cualquier rol puede consultar stock de todas las ubicaciones (la página valida sesión).

type Reader = Pick<Tx, "$queryRaw" | "inventoryMovement" | "productVariant" | "stockLevel" | "transferLine" | "location">;

export interface StockCell {
  onHand: number;
  reserved: number;
  available: number;
}

export interface StockMatrixRow {
  variantId: string;
  sku: string;
  barcode: string;
  productName: string;
  modelCode: string;
  size: string;
  color: string;
  lowStockThreshold: number | null;
  /** Por id de ubicación. Sin fila en stock_levels = 0. */
  byLocation: Record<string, StockCell>;
  /** Unidades enviadas y aún no recibidas (traspasos EN_TRANSITO). */
  inTransit: number;
  /** Físico en todas las ubicaciones + en tránsito. */
  total: number;
}

const EMPTY: StockCell = { onHand: 0, reserved: 0, available: 0 };

/** En tránsito por variante = SUM(qty_sent) de las líneas de traspasos EN_TRANSITO (se calcula, no se guarda). */
async function inTransitByVariant(reader: Reader, variantIds?: string[]): Promise<Map<string, number>> {
  const rows = await reader.transferLine.groupBy({
    by: ["variantId"],
    where: {
      transfer: { status: TransferStatus.EN_TRANSITO },
      ...(variantIds ? { variantId: { in: variantIds } } : {}),
    },
    _sum: { qtySent: true },
  });
  return new Map(rows.map((r) => [r.variantId, r._sum.qtySent ?? 0]));
}

/** Matriz variante × ubicación (RF-INV-08). Búsqueda por SKU, código de barras o nombre del producto. */
export async function getStockMatrix(opts: { search?: string; limit?: number } = {}, reader: Reader = db): Promise<StockMatrixRow[]> {
  const q = opts.search?.trim();
  const variants = await reader.productVariant.findMany({
    where: {
      active: true,
      ...(q
        ? {
            OR: [
              { sku: { contains: q, mode: "insensitive" } },
              { barcode: { contains: q } },
              { product: { name: { contains: q, mode: "insensitive" } } },
              { color: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      sku: true,
      barcode: true,
      product: { select: { name: true, modelCode: true, lowStockThreshold: true } },
      size: { select: { code: true, sortOrder: true } },
      color: { select: { name: true, code: true } },
      stockLevels: { select: { locationId: true, onHand: true, reserved: true } },
    },
    orderBy: [{ product: { modelCode: "asc" } }, { color: { code: "asc" } }, { size: { sortOrder: "asc" } }],
    take: opts.limit ?? 500,
  });
  const transit = await inTransitByVariant(reader, q ? variants.map((v) => v.id) : undefined);

  return variants.map((v) => {
    const byLocation: Record<string, StockCell> = {};
    let physical = 0;
    for (const s of v.stockLevels) {
      byLocation[s.locationId] = { onHand: s.onHand, reserved: s.reserved, available: s.onHand - s.reserved };
      physical += s.onHand;
    }
    const inTransit = transit.get(v.id) ?? 0;
    return {
      variantId: v.id,
      sku: v.sku,
      barcode: v.barcode,
      productName: v.product.name,
      modelCode: v.product.modelCode,
      size: v.size.code,
      color: v.color.name,
      lowStockThreshold: v.product.lowStockThreshold,
      byLocation,
      inTransit,
      total: physical + inTransit,
    };
  });
}

export function cellFor(row: StockMatrixRow, locationId: string): StockCell {
  return row.byLocation[locationId] ?? EMPTY;
}

export interface KardexEntry {
  id: string;
  createdAt: Date;
  locationId: string;
  locationName: string;
  type: MovementType;
  quantity: number;
  onHandAfter: number;
  refType: RefType;
  refId: string | null;
  reason: string | null;
  userName: string;
}

export interface Kardex {
  variant: { id: string; sku: string; barcode: string; productName: string; size: string; color: string };
  stock: { locationId: string; onHand: number; reserved: number; available: number }[];
  inTransit: number;
  movements: KardexEntry[];
}

/** Kardex de una variante (RF-INV-07), filtrable por ubicación. Más reciente primero. */
export async function getKardex(
  opts: { variantId: string; locationId?: string; limit?: number },
  reader: Reader = db,
): Promise<Kardex> {
  const v = await reader.productVariant.findUnique({
    where: { id: opts.variantId },
    select: {
      id: true,
      sku: true,
      barcode: true,
      product: { select: { name: true } },
      size: { select: { code: true } },
      color: { select: { name: true } },
      stockLevels: { select: { locationId: true, onHand: true, reserved: true } },
    },
  });
  if (!v) throw new AppError("NOT_FOUND", "La prenda no existe.");

  const movements = await reader.inventoryMovement.findMany({
    where: { variantId: v.id, ...(opts.locationId ? { locationId: opts.locationId } : {}) },
    select: {
      ...movementSelect,
      reason: true,
      location: { select: { name: true } },
      user: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.limit ?? 300,
  });
  const transit = await inTransitByVariant(reader, [v.id]);

  return {
    variant: { id: v.id, sku: v.sku, barcode: v.barcode, productName: v.product.name, size: v.size.code, color: v.color.name },
    stock: v.stockLevels.map((s) => ({ ...s, available: s.onHand - s.reserved })),
    inTransit: transit.get(v.id) ?? 0,
    movements: movements.map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      locationId: m.locationId,
      locationName: m.location.name,
      type: m.type,
      quantity: m.quantity,
      onHandAfter: m.onHandAfter,
      refType: m.refType,
      refId: m.refId,
      reason: m.reason,
      userName: m.user.name,
    })),
  };
}

/** Movimientos de una operación (claves `{clave}:{n}`), en orden de n. null si la operación no existe. */
export async function findOperationMovements(idempotencyKey: string, reader: Reader = db): Promise<MovementRecord[] | null> {
  const rows = await reader.inventoryMovement.findMany({
    where: { idempotencyKey: { startsWith: `${idempotencyKey}:` } },
    select: movementSelect,
  });
  if (rows.length === 0) return null;
  const n = (m: MovementRecord) => Number(m.idempotencyKey!.slice(idempotencyKey.length + 1));
  return rows.sort((a, b) => n(a) - n(b));
}

export interface LedgerMismatch {
  variantId: string;
  locationId: string;
  onHand: number;
  ledgerSum: number;
}

/** Invariante: SUM(inventory_movements.quantity) por (variante, ubicación) = stock_levels.on_hand. */
export async function findLedgerMismatches(reader: Pick<Tx, "$queryRaw"> = db): Promise<LedgerMismatch[]> {
  const rows = await reader.$queryRaw<{ variant_id: string; location_id: string; on_hand: number; ledger_sum: bigint }[]>`
    SELECT k.variant_id, k.location_id,
           COALESCE(sl.on_hand, 0) AS on_hand,
           COALESCE(m.ledger_sum, 0) AS ledger_sum
    FROM (
      SELECT variant_id, location_id FROM stock_levels
      UNION
      SELECT DISTINCT variant_id, location_id FROM inventory_movements
    ) k
    LEFT JOIN stock_levels sl ON sl.variant_id = k.variant_id AND sl.location_id = k.location_id
    LEFT JOIN (
      SELECT variant_id, location_id, SUM(quantity) AS ledger_sum
      FROM inventory_movements GROUP BY variant_id, location_id
    ) m ON m.variant_id = k.variant_id AND m.location_id = k.location_id
    WHERE COALESCE(sl.on_hand, 0) <> COALESCE(m.ledger_sum, 0)
  `;
  return rows.map((r) => ({ variantId: r.variant_id, locationId: r.location_id, onHand: r.on_hand, ledgerSum: Number(r.ledger_sum) }));
}

export interface ReservationMismatch {
  variantId: string;
  locationId: string;
  reserved: number;
  activeSum: number;
}

/** Invariante: SUM(quantity de reservas ACTIVA) por (variante, ubicación) = stock_levels.reserved. */
export async function findReservationMismatches(reader: Pick<Tx, "$queryRaw"> = db): Promise<ReservationMismatch[]> {
  const rows = await reader.$queryRaw<{ variant_id: string; location_id: string; reserved: number; active_sum: bigint }[]>`
    SELECT COALESCE(sl.variant_id, r.variant_id) AS variant_id,
           COALESCE(sl.location_id, r.location_id) AS location_id,
           COALESCE(sl.reserved, 0) AS reserved,
           COALESCE(r.active_sum, 0) AS active_sum
    FROM stock_levels sl
    FULL OUTER JOIN (
      SELECT variant_id, location_id, SUM(quantity) AS active_sum
      FROM reservations WHERE status = 'ACTIVA' GROUP BY variant_id, location_id
    ) r ON r.variant_id = sl.variant_id AND r.location_id = sl.location_id
    WHERE COALESCE(sl.reserved, 0) <> COALESCE(r.active_sum, 0)
  `;
  return rows.map((r) => ({
    variantId: r.variant_id,
    locationId: r.location_id,
    reserved: r.reserved,
    activeSum: Number(r.active_sum),
  }));
}
