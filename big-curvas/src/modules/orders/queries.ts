import { db } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { OrderStatus, ReservationStatus, TransferStatus } from "@/generated/prisma/client";
import type {
  LocationAvailability,
  OrderBoard,
  OrderBoardItem,
  OrderDetail,
  OrderVariantHit,
} from "./types";

// Consultas de SOLO LECTURA de pedidos online. Las consultas son SECUENCIALES a propósito (ver sales/internal.ts):
// pueden ejecutarse con el pool o dentro de una transacción de una sola conexión.

type Reader = typeof db;

const ADMIN_ONLY = ["ADMIN"] as const;
const PICKING_ROLES = ["ADMIN", "BODEGA"] as const;

export const SETTING_COURIERS = "couriers";

/** Ubicaciones activas: la que despacha online (bodega) primero. */
async function activeLocations(reader: Reader): Promise<{ id: string; name: string }[]> {
  const rows = await reader.location.findMany({ where: { active: true }, select: { id: true, name: true, fulfillsOnline: true } });
  return rows.sort((a, b) => Number(b.fulfillsOnline) - Number(a.fulfillsOnline) || a.name.localeCompare(b.name, "es"));
}

/** Disponible (on_hand − reserved) por variante y ubicación activa. Sin fila en stock_levels = 0. */
async function availabilityByVariant(reader: Reader, variantIds: string[]): Promise<Map<string, LocationAvailability[]>> {
  const locations = await activeLocations(reader);
  const levels = variantIds.length
    ? await reader.stockLevel.findMany({
        where: { variantId: { in: variantIds }, locationId: { in: locations.map((l) => l.id) } },
        select: { variantId: true, locationId: true, onHand: true, reserved: true },
      })
    : [];
  const map = new Map<string, LocationAvailability[]>();
  for (const variantId of variantIds) {
    map.set(
      variantId,
      locations.map((l) => {
        const s = levels.find((x) => x.variantId === variantId && x.locationId === l.id);
        return { locationId: l.id, name: l.name, available: s ? s.onHand - s.reserved : 0 };
      }),
    );
  }
  return map;
}

export interface LineCoverage {
  lineId: string;
  quantity: number;
  /** Reserva ACTIVA en la ubicación de despacho (bodega). */
  inFulfillment: number;
  /** Reserva ACTIVA en otras ubicaciones (la tienda, esperando el envío del traslado). */
  inStores: number;
  /** En un traslado EN_TRANSITO. */
  inTransit: number;
  /** quantity − lo cubierto (≥ 0). */
  shortage: number;
}

type CoverageReader = Pick<Reader, "onlineOrderLine" | "reservation" | "transferLine">;

/** Cuánto de cada línea del pedido está apartado (en bodega, en la tienda o viajando) y cuánto falta. */
export async function loadCoverage(reader: CoverageReader, orderId: string, fulfillmentLocationId: string): Promise<LineCoverage[]> {
  const lines = await reader.onlineOrderLine.findMany({ where: { orderId }, select: { id: true, quantity: true }, orderBy: { id: "asc" } });
  const ids = lines.map((l) => l.id);
  const reservations = await reader.reservation.findMany({
    where: { orderLineId: { in: ids }, status: ReservationStatus.ACTIVA },
    select: { orderLineId: true, locationId: true, quantity: true },
  });
  const moving = await reader.transferLine.findMany({
    where: { orderLineId: { in: ids }, transfer: { status: TransferStatus.EN_TRANSITO } },
    select: { orderLineId: true, qtySent: true },
  });
  return lines.map((l) => {
    const mine = reservations.filter((r) => r.orderLineId === l.id);
    const inFulfillment = mine.filter((r) => r.locationId === fulfillmentLocationId).reduce((a, r) => a + r.quantity, 0);
    const inStores = mine.filter((r) => r.locationId !== fulfillmentLocationId).reduce((a, r) => a + r.quantity, 0);
    const inTransit = moving.filter((m) => m.orderLineId === l.id).reduce((a, m) => a + m.qtySent, 0);
    return { lineId: l.id, quantity: l.quantity, inFulfillment, inStores, inTransit, shortage: Math.max(0, l.quantity - inFulfillment - inStores - inTransit) };
  });
}

/** Pedido completo para mostrar (detalle, confirmar pago, preparar, despachar). */
export async function loadOrderDetail(reader: Reader, orderId: string): Promise<OrderDetail> {
  const o = await reader.onlineOrder.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { id: true, name: true, instagramHandle: true, phone: true, address: true, commune: true } },
      fulfillmentLocation: { select: { id: true, name: true } },
      creator: { select: { name: true } },
      canceller: { select: { name: true } },
      refunder: { select: { name: true } },
    },
  });
  if (!o) throw new AppError("NOT_FOUND", "El pedido no existe.", { orderId });

  const lines = await reader.onlineOrderLine.findMany({
    where: { orderId },
    include: {
      variant: { select: { sku: true, barcode: true, product: { select: { name: true } }, size: { select: { code: true } }, color: { select: { name: true } } } },
      sourceLocation: { select: { name: true } },
    },
    orderBy: { variant: { sku: "asc" } },
  });
  const reservations = await reader.reservation.findMany({
    where: { orderLineId: { in: lines.map((l) => l.id) }, status: ReservationStatus.ACTIVA },
    select: { orderLineId: true, locationId: true, quantity: true, location: { select: { name: true } } },
  });
  const availability = await availabilityByVariant(reader, lines.map((l) => l.variantId));
  const events = await reader.onlineOrderEvent.findMany({
    where: { orderId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { status: true, createdAt: true, note: true, user: { select: { name: true } } },
  });
  const sale = await reader.sale.findUnique({ where: { onlineOrderId: orderId }, select: { id: true, number: true, status: true, total: true } });
  const transfers = await reader.transfer.findMany({
    where: { onlineOrderId: orderId },
    orderBy: { createdAt: "asc" },
    select: { id: true, number: true, status: true, fromLocation: { select: { name: true } }, toLocation: { select: { name: true } } },
  });

  const coverage = await loadCoverage(reader, orderId, o.fulfillmentLocationId);
  const blocked = o.status === OrderStatus.ESPERANDO_TRASPASO && transfers.some((t) => t.status === TransferStatus.RECIBIDO_CON_DIFERENCIAS);
  const last = events[events.length - 1];
  return {
    id: o.id,
    number: o.number,
    channel: o.channel,
    status: o.status,
    createdAt: o.createdAt,
    createdByName: o.creator.name,
    statusSince: last?.createdAt ?? o.createdAt,
    fulfillmentLocation: o.fulfillmentLocation,
    customer: o.customer,
    shippingAddress: o.shippingAddress,
    notes: o.notes,
    subtotal: o.subtotal,
    discountTotal: o.discountTotal,
    shippingCost: o.shippingCost,
    total: o.total,
    payment: o.paymentMethod ? { method: o.paymentMethod, reference: o.paymentReference, paidAt: o.paidAt } : null,
    preparedAt: o.preparedAt,
    courier: o.courier,
    trackingNumber: o.trackingNumber,
    shippedAt: o.shippedAt,
    deliveredAt: o.deliveredAt,
    refund: o.refundedAt ? { at: o.refundedAt, byName: o.refunder?.name ?? null, method: o.refundMethod ?? "", reference: o.refundReference } : null,
    cancellation: o.cancelledAt ? { at: o.cancelledAt, reason: o.cancelReason, byName: o.canceller?.name ?? null } : null,
    lines: lines.map((l) => ({
      id: l.id,
      variantId: l.variantId,
      sku: l.variant.sku,
      barcode: l.variant.barcode,
      productName: l.variant.product.name,
      color: l.variant.color.name,
      size: l.variant.size.code,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountBps: l.discountBps,
      discountAmount: l.discountAmount,
      lineTotal: l.lineTotal,
      sourceLocationId: l.sourceLocationId,
      sourceLocationName: l.sourceLocation.name,
      pickedQty: l.pickedQty,
      inTransit: coverage.find((c) => c.lineId === l.id)?.inTransit ?? 0,
      shortage: coverage.find((c) => c.lineId === l.id)?.shortage ?? 0,
      reserved: reservations
        .filter((r) => r.orderLineId === l.id)
        .map((r) => ({ locationId: r.locationId, name: r.location.name, qty: r.quantity })),
      availability: availability.get(l.variantId) ?? [],
    })),
    events: events.map((e) => ({ status: e.status, at: e.createdAt, userName: e.user.name, note: e.note })),
    sale,
    transfers: transfers.map((t) => ({
      id: t.id,
      number: t.number,
      status: t.status,
      fromLocationName: t.fromLocation.name,
      toLocationName: t.toLocation.name,
    })),
    refundPending: o.status === OrderStatus.CANCELADO && sale !== null && sale.status === "COMPLETADA",
    blockedByTransferDifference: blocked,
    canFillShortage: o.status === OrderStatus.ESPERANDO_TRASPASO && !blocked && coverage.some((c) => c.shortage > 0),
  };
}

/** Un pedido para sus pantallas. Detalle y confirmar pago: solo ADMIN; preparar/despachar: ADMIN o BODEGA. */
export async function getOrderDetail(input: { actor: Actor; orderId: string; forPicking?: boolean }): Promise<OrderDetail> {
  assertAccess(input.actor, { roles: input.forPicking ? PICKING_ROLES : ADMIN_ONLY });
  const order = await loadOrderDetail(db, input.orderId);
  assertAccess(input.actor, { roles: input.forPicking ? PICKING_ROLES : ADMIN_ONLY, locationId: order.fulfillmentLocation.id });
  return order;
}

const EMPTY_COUNTS = (): Record<OrderStatus, number> =>
  Object.fromEntries(Object.values(OrderStatus).map((s) => [s, 0])) as Record<OrderStatus, number>;

/** Tablero (RF-PED-10): conteo por estado y pedidos con su antigüedad en el estado actual. */
export async function getOrderBoard(input: { actor: Actor; statuses?: OrderStatus[] }): Promise<OrderBoard> {
  assertAccess(input.actor, { roles: ADMIN_ONLY });
  const grouped = await db.onlineOrder.groupBy({ by: ["status"], _count: { _all: true } });
  const counts = EMPTY_COUNTS();
  for (const g of grouped) counts[g.status] = g._count._all;

  const rows = await db.onlineOrder.findMany({
    where: input.statuses?.length ? { status: { in: input.statuses } } : {},
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      number: true,
      status: true,
      channel: true,
      total: true,
      createdAt: true,
      customer: { select: { name: true, instagramHandle: true } },
      lines: { select: { quantity: true } },
      events: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { createdAt: true } },
    },
  });
  const orders: OrderBoardItem[] = rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    channel: r.channel,
    customerName: r.customer.name,
    instagramHandle: r.customer.instagramHandle,
    units: r.lines.reduce((a, l) => a + l.quantity, 0),
    total: r.total,
    createdAt: r.createdAt,
    statusSince: r.events[0]?.createdAt ?? r.createdAt,
  }));
  return { counts, orders };
}

/** Pedidos listos para preparar (contador del menú de Belén). */
export async function countOrdersToPrepare(): Promise<number> {
  return db.onlineOrder.count({ where: { status: OrderStatus.LISTO_PARA_PREPARAR } });
}

/** Lista de couriers (settings.couriers, separados por coma). */
export async function getCouriers(reader: Pick<typeof db, "setting"> = db): Promise<string[]> {
  const s = await reader.setting.findUnique({ where: { key: SETTING_COURIERS } });
  return (s?.valueText ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Búsqueda de prendas para el pedido: precio y disponible por ubicación (solo consulta, no aparta). */
export async function searchOrderVariants(input: { actor: Actor; query: string; limit?: number }): Promise<OrderVariantHit[]> {
  assertAccess(input.actor, { roles: ADMIN_ONLY });
  const q = input.query.trim();
  if (!q) return [];
  const select = {
    id: true,
    sku: true,
    barcode: true,
    priceOverride: true,
    product: { select: { name: true, basePrice: true } },
    color: { select: { name: true } },
    size: { select: { code: true } },
  } as const;

  let rows = await db.productVariant.findMany({
    where: { active: true, product: { active: true }, OR: [{ barcode: q }, { sku: { equals: q, mode: "insensitive" } }] },
    select,
  });
  if (rows.length === 0) {
    rows = await db.productVariant.findMany({
      where: {
        active: true,
        product: { active: true },
        AND: q
          .split(/\s+/)
          .filter(Boolean)
          .map((t) => ({
            OR: [
              { sku: { contains: t, mode: "insensitive" as const } },
              ...(t.length >= 6 ? [{ barcode: { contains: t } }] : []),
              { product: { name: { contains: t, mode: "insensitive" as const } } },
              { color: { name: { contains: t, mode: "insensitive" as const } } },
              { size: { code: { equals: t, mode: "insensitive" as const } } },
            ],
          })),
      },
      select,
      orderBy: [{ product: { modelCode: "asc" } }, { color: { code: "asc" } }, { size: { sortOrder: "asc" } }],
      take: input.limit ?? 12,
    });
  }
  const availability = await availabilityByVariant(db, rows.map((r) => r.id));
  return rows.map((v) => ({
    variantId: v.id,
    sku: v.sku,
    barcode: v.barcode,
    productName: v.product.name,
    color: v.color.name,
    size: v.size.code,
    unitPrice: v.priceOverride ?? v.product.basePrice,
    availability: availability.get(v.id) ?? [],
  }));
}

/** Disponible actual de varias prendas (para refrescar tras un error de stock al confirmar el pago). */
export async function getVariantAvailability(input: { actor: Actor; variantIds: string[] }): Promise<Record<string, LocationAvailability[]>> {
  assertAccess(input.actor, { roles: ADMIN_ONLY });
  const ids = [...new Set(input.variantIds)].slice(0, 100);
  return Object.fromEntries(await availabilityByVariant(db, ids));
}
