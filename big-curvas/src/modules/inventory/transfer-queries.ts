import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { TransferStatus, type Prisma } from "@/generated/prisma/client";
import type { DifferenceResolution, TransferReason } from "./types";

// Consultas de SOLO LECTURA de traslados: bandejas, detalle, contadores y búsqueda de prendas para armarlos.
// Cualquier rol con acceso a la pantalla puede consultar; quien escribe es InventoryService.

export const SETTING_TRANSIT_ALERT_DAYS = "transfer_transit_alert_days";
const DEFAULT_TRANSIT_ALERT_DAYS = 3;
const DAY_MS = 86_400_000;

export type TransferBucket = "por-enviar" | "por-recibir" | "con-diferencias" | "historial";

export interface TransferListItem {
  id: string;
  number: string;
  status: TransferStatus;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  createdAt: Date;
  sentAt: Date | null;
  receivedAt: Date | null;
  lineCount: number;
  unitsSent: number;
  unitsReceived: number | null;
  /** Prendas con diferencia sin resolver (solo en RECIBIDO_CON_DIFERENCIAS). */
  unresolvedLines: number;
  /** Días completos en tránsito (solo EN_TRANSITO). */
  daysInTransit: number | null;
  /** EN_TRANSITO por más de `transfer_transit_alert_days`, calculado al consultar (sin job). */
  overdue: boolean;
}

export async function getTransitAlertDays(reader: Pick<typeof db, "setting"> = db): Promise<number> {
  const s = await reader.setting.findUnique({ where: { key: SETTING_TRANSIT_ALERT_DAYS } });
  return s?.valueInt ?? DEFAULT_TRANSIT_ALERT_DAYS;
}

function whereFor(bucket: TransferBucket, locationId?: string): Prisma.TransferWhereInput {
  switch (bucket) {
    case "por-enviar":
      return { status: TransferStatus.BORRADOR, ...(locationId ? { fromLocationId: locationId } : {}) };
    case "por-recibir":
      return { status: TransferStatus.EN_TRANSITO, ...(locationId ? { toLocationId: locationId } : {}) };
    case "con-diferencias":
      return { status: TransferStatus.RECIBIDO_CON_DIFERENCIAS };
    case "historial":
      return {
        OR: [
          { status: { in: [TransferStatus.RECIBIDO, TransferStatus.RECIBIDO_CON_DIFERENCIAS, TransferStatus.CERRADO, TransferStatus.ANULADO] } },
          { status: TransferStatus.EN_TRANSITO, ...(locationId ? { fromLocationId: locationId } : {}) },
        ],
        ...(locationId ? { AND: [{ OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] }] } : {}),
      };
  }
}

const listSelect = {
  id: true,
  number: true,
  status: true,
  fromLocationId: true,
  toLocationId: true,
  createdAt: true,
  sentAt: true,
  receivedAt: true,
  fromLocation: { select: { name: true } },
  toLocation: { select: { name: true } },
  lines: { select: { qtySent: true, qtyReceived: true, differenceResolution: true } },
} as const;

/** Bandeja de traslados. `locationId` = ubicación activa del usuario (sin ella, todas). */
export async function listTransfers(opts: { bucket: TransferBucket; locationId?: string; limit?: number; now?: Date }): Promise<TransferListItem[]> {
  const now = opts.now ?? new Date();
  const [rows, alertDays] = await Promise.all([
    db.transfer.findMany({
      where: whereFor(opts.bucket, opts.locationId),
      select: listSelect,
      orderBy: opts.bucket === "por-enviar" ? { createdAt: "desc" } : [{ sentAt: "desc" }, { createdAt: "desc" }],
      take: opts.limit ?? 100,
    }),
    getTransitAlertDays(),
  ]);

  return rows.map((t) => {
    const inTransit = t.status === TransferStatus.EN_TRANSITO && t.sentAt !== null;
    const elapsed = inTransit ? now.getTime() - t.sentAt!.getTime() : 0;
    const received = t.lines.every((l) => l.qtyReceived !== null) ? t.lines.reduce((a, l) => a + (l.qtyReceived ?? 0), 0) : null;
    return {
      id: t.id,
      number: t.number,
      status: t.status,
      fromLocationId: t.fromLocationId,
      fromLocationName: t.fromLocation.name,
      toLocationId: t.toLocationId,
      toLocationName: t.toLocation.name,
      createdAt: t.createdAt,
      sentAt: t.sentAt,
      receivedAt: t.receivedAt,
      lineCount: t.lines.length,
      unitsSent: t.lines.reduce((a, l) => a + l.qtySent, 0),
      unitsReceived: received,
      unresolvedLines: t.lines.filter((l) => l.qtyReceived !== null && l.qtyReceived !== l.qtySent && l.differenceResolution === null).length,
      daysInTransit: inTransit ? Math.floor(elapsed / DAY_MS) : null,
      overdue: inTransit && elapsed > alertDays * DAY_MS,
    };
  });
}

export interface PendingTransferCounts {
  porEnviar: number;
  porRecibir: number;
  conDiferencias: number;
  /** Lo que muestra el menú: por enviar + por recibir (+ con diferencias si `includeDifferences`). */
  total: number;
}

/** Contadores del menú "Traslados" para una ubicación (sin ella, todas). Belén suma también las diferencias. */
export async function countPendingTransfers(opts: { locationId?: string; includeDifferences: boolean }): Promise<PendingTransferCounts> {
  const [porEnviar, porRecibir, conDiferencias] = await Promise.all([
    db.transfer.count({ where: whereFor("por-enviar", opts.locationId) }),
    db.transfer.count({ where: whereFor("por-recibir", opts.locationId) }),
    opts.includeDifferences ? db.transfer.count({ where: whereFor("con-diferencias") }) : Promise.resolve(0),
  ]);
  return { porEnviar, porRecibir, conDiferencias, total: porEnviar + porRecibir + conDiferencias };
}

export interface TransferDetailLine {
  id: string;
  variantId: string;
  sku: string;
  barcode: string;
  productName: string;
  color: string;
  size: string;
  qtySent: number;
  qtyReceived: number | null;
  differenceResolution: DifferenceResolution | null;
  linked: boolean;
}

export interface TransferDetail {
  id: string;
  number: string;
  status: TransferStatus;
  reason: TransferReason;
  fromLocation: { id: string; name: string };
  toLocation: { id: string; name: string };
  createdAt: Date;
  createdByName: string;
  sentAt: Date | null;
  sentByName: string | null;
  receivedAt: Date | null;
  receivedByName: string | null;
  resolvedAt: Date | null;
  resolvedByName: string | null;
  resolutionNotes: string | null;
  lines: TransferDetailLine[];
  daysInTransit: number | null;
  overdue: boolean;
  alertDays: number;
}

export async function getTransferDetail(transferId: string, now = new Date()): Promise<TransferDetail> {
  const [t, alertDays] = await Promise.all([
    db.transfer.findUnique({
      where: { id: transferId },
      select: {
        id: true,
        number: true,
        status: true,
        reason: true,
        createdAt: true,
        sentAt: true,
        receivedAt: true,
        resolvedAt: true,
        resolutionNotes: true,
        fromLocation: { select: { id: true, name: true } },
        toLocation: { select: { id: true, name: true } },
        creator: { select: { name: true } },
        sender: { select: { name: true } },
        receiver: { select: { name: true } },
        resolver: { select: { name: true } },
        lines: {
          select: {
            id: true,
            variantId: true,
            qtySent: true,
            qtyReceived: true,
            differenceResolution: true,
            orderLineId: true,
            reservationId: true,
            variant: {
              select: {
                sku: true,
                barcode: true,
                product: { select: { name: true } },
                color: { select: { name: true } },
                size: { select: { code: true, sortOrder: true } },
              },
            },
          },
        },
      },
    }),
    getTransitAlertDays(),
  ]);
  if (!t) throw new AppError("NOT_FOUND", "El traslado no existe.", { transferId });

  const inTransit = t.status === TransferStatus.EN_TRANSITO && t.sentAt !== null;
  const elapsed = inTransit ? now.getTime() - t.sentAt!.getTime() : 0;
  return {
    id: t.id,
    number: t.number,
    status: t.status,
    reason: t.reason,
    fromLocation: t.fromLocation,
    toLocation: t.toLocation,
    createdAt: t.createdAt,
    createdByName: t.creator.name,
    sentAt: t.sentAt,
    sentByName: t.sender?.name ?? null,
    receivedAt: t.receivedAt,
    receivedByName: t.receiver?.name ?? null,
    resolvedAt: t.resolvedAt,
    resolvedByName: t.resolver?.name ?? null,
    resolutionNotes: t.resolutionNotes,
    lines: t.lines
      .sort((a, b) => a.variant.sku.localeCompare(b.variant.sku))
      .map((l) => ({
        id: l.id,
        variantId: l.variantId,
        sku: l.variant.sku,
        barcode: l.variant.barcode,
        productName: l.variant.product.name,
        color: l.variant.color.name,
        size: l.variant.size.code,
        qtySent: l.qtySent,
        qtyReceived: l.qtyReceived,
        differenceResolution: l.differenceResolution,
        linked: l.orderLineId !== null || l.reservationId !== null,
      })),
    daysInTransit: inTransit ? Math.floor(elapsed / DAY_MS) : null,
    overdue: inTransit && elapsed > alertDays * DAY_MS,
    alertDays,
  };
}

export interface TransferVariantHit {
  variantId: string;
  sku: string;
  barcode: string;
  productName: string;
  color: string;
  size: string;
  /** Disponible (físico − reservado) en la ubicación de origen: informativo, la validación real es al enviar. */
  available: number;
}

/**
 * Busca prendas para agregar a un traslado por código de barras / SKU exactos o por texto.
 * Un código exacto devuelve solo esa prenda (es lo que hace el lector).
 */
export async function searchTransferVariants(opts: { query: string; fromLocationId: string; limit?: number }): Promise<TransferVariantHit[]> {
  const q = opts.query.trim();
  if (!q) return [];
  const select = {
    id: true,
    sku: true,
    barcode: true,
    product: { select: { name: true } },
    color: { select: { name: true } },
    size: { select: { code: true } },
    stockLevels: { where: { locationId: opts.fromLocationId }, select: { onHand: true, reserved: true } },
  } as const;

  let rows = await db.productVariant.findMany({
    where: { active: true, OR: [{ barcode: q }, { sku: { equals: q, mode: "insensitive" } }] },
    select,
  });
  if (rows.length === 0) {
    rows = await db.productVariant.findMany({
      where: {
        active: true,
        OR: [
          { sku: { contains: q, mode: "insensitive" } },
          { barcode: { contains: q } },
          { product: { name: { contains: q, mode: "insensitive" } } },
          { color: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      select,
      orderBy: [{ product: { modelCode: "asc" } }, { color: { code: "asc" } }, { size: { sortOrder: "asc" } }],
      take: opts.limit ?? 12,
    });
  }
  return rows.map((v) => ({
    variantId: v.id,
    sku: v.sku,
    barcode: v.barcode,
    productName: v.product.name,
    color: v.color.name,
    size: v.size.code,
    available: v.stockLevels[0] ? v.stockLevels[0].onHand - v.stockLevels[0].reserved : 0,
  }));
}
