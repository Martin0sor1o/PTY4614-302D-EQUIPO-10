import type { Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { priceSale, effectivePrice } from "@/modules/sales/client";
import { Prisma } from "@/generated/prisma/client";
import { daysSince, suggestRefundMethod } from "./pricing";
import { getReturnPolicy } from "./policy";
import type { ReturnableLine, ReturnableSale } from "./types";

// Utilidades internas del módulo returns (no se exportan desde index.ts). Lecturas SECUENCIALES: dentro de una transacción
// interactiva todas las consultas comparten una sola conexión (por eso no se usan `include` anidados).

export const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5_000,
  timeout: 10_000,
} as const;

type Reader = Pick<Tx, "sale" | "saleLine" | "payment" | "location" | "onlineOrder" | "productVariant" | "product" | "size" | "color" | "setting">;

export interface VariantLabel {
  sku: string;
  productName: string;
  color: string;
  size: string;
}

export async function variantLabels(reader: Pick<Tx, "productVariant" | "product" | "size" | "color">, variantIds: readonly string[]): Promise<Map<string, VariantLabel>> {
  const ids = [...new Set(variantIds)];
  const variants = await reader.productVariant.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, productId: true, sizeId: true, colorId: true } });
  const products = await reader.product.findMany({ where: { id: { in: [...new Set(variants.map((v) => v.productId))] } }, select: { id: true, name: true } });
  const sizes = await reader.size.findMany({ where: { id: { in: [...new Set(variants.map((v) => v.sizeId))] } }, select: { id: true, code: true } });
  const colors = await reader.color.findMany({ where: { id: { in: [...new Set(variants.map((v) => v.colorId))] } }, select: { id: true, name: true } });
  const nameOf = new Map(products.map((p) => [p.id, p.name]));
  const sizeOf = new Map(sizes.map((s) => [s.id, s.code]));
  const colorOf = new Map(colors.map((c) => [c.id, c.name]));
  return new Map(
    variants.map((v) => [v.id, { sku: v.sku, productName: nameOf.get(v.productId) ?? v.sku, color: colorOf.get(v.colorId) ?? "", size: sizeOf.get(v.sizeId) ?? "" }]),
  );
}

export interface LoadedSale extends ReturnableSale {
  /** Variantes por línea de venta, para bloquear stock y validar. */
  lineByid: Map<string, ReturnableLine>;
}

/**
 * Carga la venta con lo devolvible (S-02): COMPLETADA; si es online, el pedido debe estar DESPACHADO o ENTREGADO.
 * El plazo (S-01) corre desde la venta (POS) o desde la entrega/despacho (online).
 */
export async function loadSaleForReturn(reader: Reader, saleId: string, now: Date = new Date()): Promise<LoadedSale> {
  const sale = await reader.sale.findUnique({
    where: { id: saleId },
    select: { id: true, number: true, channel: true, status: true, createdAt: true, locationId: true, onlineOrderId: true },
  });
  if (!sale) throw new AppError("NOT_FOUND", "La venta no existe.");
  if (sale.status !== "COMPLETADA") throw new AppError("CONFLICT", `La venta ${sale.number} está anulada: no se puede devolver.`);

  const location = await reader.location.findUnique({ where: { id: sale.locationId }, select: { name: true } });
  let orderNumber: string | null = null;
  let referenceDate = sale.createdAt;
  if (sale.channel !== "POS") {
    const order = sale.onlineOrderId
      ? await reader.onlineOrder.findUnique({ where: { id: sale.onlineOrderId }, select: { number: true, status: true, deliveredAt: true, shippedAt: true } })
      : null;
    if (!order) throw new AppError("VALIDATION", `La venta ${sale.number} no tiene un pedido online asociado.`);
    if (order.status !== "DESPACHADO" && order.status !== "ENTREGADO") {
      throw new AppError("VALIDATION", `El pedido ${order.number} todavía no se despacha: se cancela, no se devuelve.`);
    }
    orderNumber = order.number;
    referenceDate = order.deliveredAt ?? order.shippedAt ?? sale.createdAt;
  }

  const lines = await reader.saleLine.findMany({ where: { saleId }, orderBy: { id: "asc" } });
  const labels = await variantLabels(reader, lines.map((l) => l.variantId));
  const payments = await reader.payment.findMany({ where: { saleId }, select: { method: true } });
  const policy = await getReturnPolicy(reader);
  const days = daysSince(referenceDate, now);
  const paymentMethods = [...new Set(payments.map((p) => p.method as string))];

  const mapped: ReturnableLine[] = lines.map((l) => {
    const label = labels.get(l.variantId);
    return {
      saleLineId: l.id,
      variantId: l.variantId,
      sku: label?.sku ?? l.variantId,
      productName: label?.productName ?? "",
      color: label?.color ?? "",
      size: label?.size ?? "",
      soldQty: l.quantity,
      returnedQty: l.returnedQuantity,
      returnableQty: l.quantity - l.returnedQuantity,
      lineTotal: l.lineTotal,
    };
  });
  return {
    id: sale.id,
    number: sale.number,
    channel: sale.channel,
    createdAt: sale.createdAt,
    locationId: sale.locationId,
    locationName: location?.name ?? "",
    orderNumber,
    referenceDate,
    daysSince: days,
    windowDays: policy.windowDays,
    outOfWindow: days > policy.windowDays,
    paymentMethods,
    paidWithVoucher: paymentMethods.includes("VALE"),
    suggestedRefundMethod: suggestRefundMethod(paymentMethods),
    lines: mapped,
    lineByid: new Map(mapped.map((l) => [l.saleLineId, l])),
  };
}

export interface PricedNewLines {
  total: number;
  lines: { variantId: string; sku: string; label: string; qty: number; unitPrice: number; lineTotal: number }[];
}

/** Precio de las prendas nuevas de un cambio con los precios vigentes del servidor y SIN descuentos (S-05). */
export async function priceNewLines(reader: Reader, lines: readonly { variantId: string; qty: number }[]): Promise<PricedNewLines> {
  const merged = new Map<string, number>();
  for (const l of lines) merged.set(l.variantId, (merged.get(l.variantId) ?? 0) + l.qty);
  const ids = [...merged.keys()];
  const variants = await reader.productVariant.findMany({
    where: { id: { in: ids }, active: true },
    select: { id: true, sku: true, priceOverride: true, productId: true },
  });
  const products = await reader.product.findMany({ where: { id: { in: [...new Set(variants.map((v) => v.productId))] }, active: true }, select: { id: true, basePrice: true } });
  const basePrice = new Map(products.map((p) => [p.id, p.basePrice]));
  const usable = variants.filter((v) => basePrice.has(v.productId));
  if (usable.length !== ids.length) throw new AppError("NOT_FOUND", "Una o más prendas nuevas no existen o están inactivas.");
  const labels = await variantLabels(reader, ids);
  const byId = new Map(usable.map((v) => [v.id, v]));
  const ordered = ids.map((id) => {
    const v = byId.get(id)!;
    return { variantId: id, qty: merged.get(id)!, unitPrice: effectivePrice({ priceOverride: v.priceOverride, basePrice: basePrice.get(v.productId)! }), sku: v.sku };
  });
  const priced = priceSale(ordered.map((o) => ({ unitPrice: o.unitPrice, quantity: o.qty, discountBps: 0 })));
  return {
    total: priced.total,
    lines: ordered.map((o, i) => {
      const l = labels.get(o.variantId);
      return { variantId: o.variantId, sku: o.sku, label: l ? `${l.productName} · ${l.color} · T${l.size}` : o.sku, qty: o.qty, unitPrice: o.unitPrice, lineTotal: priced.lines[i].lineTotal };
    }),
  };
}
