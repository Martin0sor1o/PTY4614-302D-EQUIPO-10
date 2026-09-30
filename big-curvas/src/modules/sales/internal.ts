import type { Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { Prisma } from "@/generated/prisma/client";
import type { PaymentMethodCode } from "./pricing";
import type { SaleView } from "./types";

// Utilidades internas del módulo sales (no se exportan desde index.ts).

export const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5_000,
  timeout: 10_000,
} as const;

export const SETTING_MAX_DISCOUNT = "max_seller_discount_bps";

export async function getPosLocation(tx: Pick<Tx, "location">, locationId: string) {
  const loc = await tx.location.findFirst({
    where: { id: locationId, active: true },
    select: { id: true, name: true, sellsPos: true, salePrefix: true },
  });
  if (!loc) throw new AppError("NOT_FOUND", "La ubicación no existe o está inactiva.", { locationId });
  // RN-28: la bodega no vende al público.
  if (!loc.sellsPos) throw new AppError("VALIDATION", `${loc.name} no vende en POS.`, { locationId });
  return loc;
}

export async function getDiscountLimitBps(tx: Pick<Tx, "setting">): Promise<number> {
  const s = await tx.setting.findUnique({ where: { key: SETTING_MAX_DISCOUNT } });
  if (!s) throw new AppError("VALIDATION", "Falta la configuración del descuento máximo (max_seller_discount_bps).");
  return s.valueInt;
}

const lineInclude = {
  variant: {
    select: {
      sku: true,
      size: { select: { code: true } },
      color: { select: { name: true } },
      product: { select: { name: true } },
    },
  },
} satisfies Prisma.SaleLineInclude;

/**
 * Venta completa para mostrar. Consultas SECUENCIALES a propósito: con relaciones anidadas Prisma las lanza en
 * paralelo y, dentro de una transacción interactiva (una sola conexión), el driver pg lo desaconseja.
 */
export async function loadSaleView(
  reader: Pick<Tx, "sale" | "saleLine" | "payment">,
  where: { id: string } | { idempotencyKey: string },
): Promise<SaleView | null> {
  const s = await reader.sale.findUnique({
    where,
    include: { location: { select: { id: true, name: true, address: true } }, seller: { select: { name: true } } },
  });
  if (!s) return null;
  const lines = await reader.saleLine.findMany({ where: { saleId: s.id }, orderBy: { id: "asc" }, include: lineInclude });
  const payments = await reader.payment.findMany({ where: { saleId: s.id }, orderBy: { id: "asc" } });
  return {
    id: s.id,
    number: s.number,
    status: s.status,
    createdAt: s.createdAt,
    location: s.location,
    sellerName: s.seller.name,
    subtotal: s.subtotal,
    discountTotal: s.discountTotal,
    total: s.total,
    roundingAdjustment: s.roundingAdjustment,
    lines: lines.map((l) => ({
      variantId: l.variantId,
      sku: l.variant.sku,
      productName: l.variant.product.name,
      color: l.variant.color.name,
      size: l.variant.size.code,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountBps: l.manualDiscountBps,
      discount: l.manualDiscount,
      lineTotal: l.lineTotal,
    })),
    payments: payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference,
      cashReceived: p.cashReceived,
      change: p.cashReceived === null ? null : p.cashReceived - p.amount,
    })),
  };
}

/**
 * Caja abierta de la tienda, bloqueada: FOR SHARE (venta) permite ventas simultáneas; FOR UPDATE (cierre)
 * espera a las ventas en curso y bloquea a las nuevas hasta el COMMIT.
 */
export async function lockOpenCashSession(
  tx: Tx,
  locationId: string,
  mode: "share" | "update",
): Promise<{ id: string; openingCash: number } | null> {
  const rows =
    mode === "share"
      ? await tx.$queryRaw<{ id: string; opening_cash: number }[]>`
          SELECT id, opening_cash FROM cash_sessions WHERE location_id = ${locationId} AND status = 'ABIERTA' FOR SHARE`
      : await tx.$queryRaw<{ id: string; opening_cash: number }[]>`
          SELECT id, opening_cash FROM cash_sessions WHERE location_id = ${locationId} AND status = 'ABIERTA' FOR UPDATE`;
  return rows[0] ? { id: rows[0].id, openingCash: rows[0].opening_cash } : null;
}

export const emptyByMethod = (): Record<PaymentMethodCode, number> => ({ EFECTIVO: 0, DEBITO: 0, CREDITO: 0, TRANSFERENCIA: 0 });
