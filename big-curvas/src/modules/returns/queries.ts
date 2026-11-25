import { db, type Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import type { Prisma } from "@/generated/prisma/client";
import { loadSaleForReturn, variantLabels } from "./internal";
import { getReturnPolicy } from "./policy";
import { searchSalesSchema } from "./schemas";
import type { ReturnableSale, ReturnSaleHit, ReturnView } from "./types";

const ROLES = ["ADMIN", "VENDEDORA"] as const;

/** Una devolución completa para el comprobante. Lecturas secuenciales (puede llamarse con el pool, ya confirmada la operación). */
export async function loadReturnView(
  reader: Pick<Tx, "return" | "returnLine" | "location" | "sale" | "user" | "voucher" | "productVariant" | "product" | "size" | "color">,
  id: string,
): Promise<ReturnView> {
  const r = await reader.return.findUnique({ where: { id } });
  if (!r) throw new AppError("NOT_FOUND", "La devolución no existe.");
  const location = await reader.location.findUniqueOrThrow({ where: { id: r.locationId }, select: { id: true, name: true } });
  const sale = await reader.sale.findUniqueOrThrow({ where: { id: r.originalSaleId }, select: { id: true, number: true } });
  const user = await reader.user.findUniqueOrThrow({ where: { id: r.userId }, select: { name: true } });
  const lines = await reader.returnLine.findMany({ where: { returnId: id }, orderBy: { id: "asc" } });
  const labels = await variantLabels(reader, lines.map((l) => l.variantId));
  const voucher = r.voucherId
    ? await reader.voucher.findUnique({ where: { id: r.voucherId }, select: { id: true, code: true, initialAmount: true, balance: true, expiresAt: true } })
    : null;
  const newSale = r.newSaleId ? await reader.sale.findUnique({ where: { id: r.newSaleId }, select: { id: true, number: true, total: true } }) : null;
  return {
    id: r.id,
    number: r.number,
    type: r.type,
    reason: r.reason,
    reasonNote: r.reasonNote,
    createdAt: r.createdAt,
    location,
    sale,
    userName: user.name,
    valueReturned: r.valueReturned,
    refundMethod: r.refundMethod,
    refundAmount: r.refundAmount,
    roundingAdjustment: r.roundingAdjustment,
    refundReference: r.refundReference,
    approvalId: r.approvalId,
    lines: lines.map((l) => {
      const label = labels.get(l.variantId);
      return {
        saleLineId: l.saleLineId,
        variantId: l.variantId,
        sku: label?.sku ?? l.variantId,
        productName: label?.productName ?? "",
        color: label?.color ?? "",
        size: label?.size ?? "",
        qty: l.quantity,
        amount: l.amount,
        condition: l.condition,
      };
    }),
    voucher,
    newSale,
  };
}

/** Una devolución para el comprobante: ADMIN cualquiera; VENDEDORA solo de su ubicación. */
export async function getReturn(actor: Actor, returnId: string): Promise<ReturnView> {
  assertAccess(actor, { roles: ROLES });
  const view = await loadReturnView(db, returnId);
  assertAccess(actor, { roles: ROLES, locationId: view.location.id });
  return view;
}

/**
 * RF-DEV-01: buscar la venta original. Con texto: por N° (o parte) entre las ventas de cualquier ubicación (la clienta puede
 * traer un pedido online a la tienda). Sin texto: las ventas recientes de ESTA tienda dentro del plazo. Solo COMPLETADAS.
 */
export async function searchSalesForReturn(input: { actor: Actor; locationId: string; query?: string; limit?: number; now?: Date }): Promise<ReturnSaleHit[]> {
  assertAccess(input.actor, { roles: ROLES, locationId: input.locationId });
  const { locationId, query, limit } = parseInput(searchSalesSchema, input);
  const now = input.now ?? new Date();
  let where: Prisma.SaleWhereInput;
  if (query) {
    where = { status: "COMPLETADA", number: { contains: query, mode: "insensitive" } };
  } else {
    const policy = await getReturnPolicy(db);
    where = { status: "COMPLETADA", locationId, createdAt: { gte: new Date(now.getTime() - policy.windowDays * 86_400_000) } };
  }
  const sales = await db.sale.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, number: true, channel: true, createdAt: true, total: true, locationId: true },
  });
  if (sales.length === 0) return [];
  const locations = await db.location.findMany({ where: { id: { in: [...new Set(sales.map((s) => s.locationId))] } }, select: { id: true, name: true } });
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const sums = await db.saleLine.groupBy({ by: ["saleId"], where: { saleId: { in: sales.map((s) => s.id) } }, _sum: { quantity: true, returnedQuantity: true } });
  const unitsOf = new Map(sums.map((s) => [s.saleId, (s._sum.quantity ?? 0) - (s._sum.returnedQuantity ?? 0)]));
  return sales.map((s) => ({
    id: s.id,
    number: s.number,
    channel: s.channel,
    createdAt: s.createdAt,
    total: s.total,
    locationName: locationName.get(s.locationId) ?? "",
    returnableUnits: unitsOf.get(s.id) ?? 0,
  }));
}

/** La venta con lo que se puede devolver de cada línea y las reglas que aplican (plazo, vale, medio sugerido). */
export async function getSaleForReturn(input: { actor: Actor; locationId: string; saleId: string; now?: Date }): Promise<ReturnableSale> {
  assertAccess(input.actor, { roles: ROLES, locationId: input.locationId });
  const { lineByid: _ignored, ...sale } = await loadSaleForReturn(db, input.saleId, input.now);
  void _ignored;
  return sale;
}
