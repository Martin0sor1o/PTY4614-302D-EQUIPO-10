import { db } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import { Prisma } from "@/generated/prisma/client";
import { startOfDaySantiago } from "@/lib/dates";
import { emptyByMethod, loadSaleView } from "./internal";
import { effectivePrice, type PaymentMethodCode } from "./pricing";
import { searchSchema } from "./schemas";
import type { DaySales, PosItem, SaleView } from "./types";

// Consultas de SOLO LECTURA del POS. El stock de las demás ubicaciones se muestra únicamente como consulta.

const ROLES = ["ADMIN", "VENDEDORA"] as const;

const itemSelect = {
  id: true,
  sku: true,
  barcode: true,
  priceOverride: true,
  product: { select: { name: true, basePrice: true } },
  size: { select: { code: true, sortOrder: true } },
  color: { select: { name: true } },
  stockLevels: { select: { locationId: true, onHand: true, reserved: true } },
} satisfies Prisma.ProductVariantSelect;

type ItemRow = Prisma.ProductVariantGetPayload<{ select: typeof itemSelect }>;

async function toPosItems(rows: ItemRow[], locationId: string): Promise<PosItem[]> {
  const locations = await db.location.findMany({ where: { active: true }, select: { id: true, name: true } });
  const nameOf = new Map(locations.map((l) => [l.id, l.name]));
  return rows.map((v) => {
    const mine = v.stockLevels.find((s) => s.locationId === locationId);
    const onHand = mine?.onHand ?? 0;
    const reserved = mine?.reserved ?? 0;
    return {
      variantId: v.id,
      sku: v.sku,
      barcode: v.barcode,
      productName: v.product.name,
      color: v.color.name,
      size: v.size.code,
      unitPrice: effectivePrice({ priceOverride: v.priceOverride, basePrice: v.product.basePrice }),
      here: { onHand, reserved, available: onHand - reserved },
      others: v.stockLevels
        .filter((s) => s.locationId !== locationId && s.onHand > 0)
        .map((s) => ({
          locationId: s.locationId,
          name: nameOf.get(s.locationId) ?? "Otra ubicación",
          onHand: s.onHand,
          reserved: s.reserved,
          available: s.onHand - s.reserved,
        })),
    };
  });
}

/**
 * Búsqueda del POS por SKU, código de barras o nombre/color. Varias palabras se combinan con AND
 * ("jeans azul 48"). Primero la coincidencia exacta de código de barras o SKU (lo que entrega el lector).
 */
export async function searchPosItems(input: { actor: Actor; locationId: string; query: string; limit?: number }): Promise<PosItem[]> {
  assertAccess(input.actor, { roles: ROLES, locationId: input.locationId });
  const { locationId, query, limit } = parseInput(searchSchema, input);
  const tokens = query.split(/\s+/).filter(Boolean);

  const rows = await db.productVariant.findMany({
    where: {
      active: true,
      product: { active: true },
      AND: tokens.map((t) => ({
        OR: [
          { sku: { contains: t, mode: "insensitive" as const } },
          // Código de barras parcial solo desde 6 caracteres: "48" (talla) no debe coincidir con cualquier código.
          ...(t.length >= 6 ? [{ barcode: { contains: t } }] : []),
          { product: { name: { contains: t, mode: "insensitive" as const } } },
          { color: { name: { contains: t, mode: "insensitive" as const } } },
          { size: { code: { equals: t, mode: "insensitive" as const } } },
        ],
      })),
    },
    select: itemSelect,
    orderBy: [{ product: { modelCode: "asc" } }, { color: { code: "asc" } }, { size: { sortOrder: "asc" } }],
    take: 200,
  });

  const q = query.trim().toLowerCase();
  const exact = (v: ItemRow) => v.barcode.toLowerCase() === q || v.sku.toLowerCase() === q;
  const sorted = [...rows.filter(exact), ...rows.filter((v) => !exact(v))].slice(0, limit);
  return toPosItems(sorted, locationId);
}

/** Datos actuales de prendas ya en el carrito (precio y disponibilidad), para refrescar tras un error de stock. */
export async function getPosItemsByIds(input: { actor: Actor; locationId: string; variantIds: string[] }): Promise<PosItem[]> {
  assertAccess(input.actor, { roles: ROLES, locationId: input.locationId });
  const ids = [...new Set(input.variantIds)].slice(0, 100);
  const rows = await db.productVariant.findMany({ where: { id: { in: ids } }, select: itemSelect });
  return toPosItems(rows, input.locationId);
}

/** Una venta para el ticket: ADMIN cualquiera; VENDEDORA solo de su tienda. */
export async function getSaleForActor(actor: Actor, saleId: string): Promise<SaleView> {
  assertAccess(actor, { roles: ROLES });
  const sale = await loadSaleView(db, { id: saleId });
  if (!sale) throw new AppError("NOT_FOUND", "La venta no existe.");
  assertAccess(actor, { roles: ROLES, locationId: sale.location.id });
  return sale;
}

/** Ventas de la tienda en el día calendario de Chile (America/Santiago) que contiene `now`, con total por medio de pago. */
export async function listSalesOfDay(input: { actor: Actor; locationId: string; now?: Date }): Promise<DaySales> {
  assertAccess(input.actor, { roles: ROLES, locationId: input.locationId });
  const from = startOfDaySantiago(input.now ?? new Date());
  // +30 h cae siempre dentro del día siguiente (los días miden entre 23 y 25 h).
  const to = startOfDaySantiago(new Date(from.getTime() + 30 * 3_600_000));

  const rows = await db.sale.findMany({
    where: { locationId: input.locationId, createdAt: { gte: from, lt: to } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const sales = (await Promise.all(rows.map((r) => loadSaleView(db, { id: r.id })))).filter((s): s is SaleView => s !== null);

  const totalsByMethod = emptyByMethod();
  for (const s of sales) {
    if (s.status !== "COMPLETADA") continue;
    for (const p of s.payments) if (p.method !== "VALE") totalsByMethod[p.method as PaymentMethodCode] += p.amount;
  }
  return {
    from,
    sales: sales.map((s) => ({ ...s, paymentSummary: s.payments.map((p) => p.method).join(" + ") })),
    totalsByMethod,
    totalCollected: Object.values(totalsByMethod).reduce((a, b) => a + b, 0),
    count: sales.filter((s) => s.status === "COMPLETADA").length,
  };
}
