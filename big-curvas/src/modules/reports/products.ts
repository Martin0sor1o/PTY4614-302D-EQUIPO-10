import { db } from "@/lib/db";
import type { Actor } from "@/lib/access";
import { daysBetweenKeys, santiagoDayKey } from "@/lib/dates";
import { parseInput } from "@/lib/validation";
import {
  DEFAULT_FRIDAY_DAYS,
  DEFAULT_NO_ROTATION_DAYS,
  SETTING_FRIDAY_DAYS,
  SETTING_NO_ROTATION_DAYS,
  assertReportsAccess,
  lastDaysRange,
  productSaleWhere,
  readPositiveIntSetting,
  windowOfDays,
} from "./internal";
import { rangeSchema, topSellersSchema } from "./schemas";
import type { FridayList, FridayRow, NoRotation, NoRotationRow, TopSellerModel, TopSellers } from "./types";

// Reportes de PRODUCTO. Solo lectura. Cuentan las ventas COMPLETADA que no son de un pedido CANCELADO
// (la prenda de un pedido cancelado nunca salió, aunque su reembolso siga pendiente).

const variantLabel = {
  sku: true,
  size: { select: { code: true } },
  color: { select: { name: true } },
  product: { select: { id: true, modelCode: true, name: true } },
} as const;

/**
 * Ranking de modelos por unidades en el período, con detalle por variante e ingreso (Σ line_total, ya con descuento).
 * Orden: unidades ↓, ingreso ↓, código de modelo ↑. Los modelos con las mismas unidades y el mismo ingreso comparten puesto.
 */
export async function getTopSellers(input: { actor: Actor; from: string; to: string; limit?: number }): Promise<TopSellers> {
  assertReportsAccess(input.actor);
  const { from, to, limit } = parseInput(topSellersSchema, input);
  parseInput(rangeSchema, { from, to });

  const grouped = await db.saleLine.groupBy({
    by: ["variantId"],
    where: { sale: productSaleWhere(windowOfDays(from, to)) },
    _sum: { quantity: true, lineTotal: true },
  });
  if (grouped.length === 0) return { from, to, models: [], totalModels: 0, totalUnits: 0, totalRevenue: 0 };

  const variants = await db.productVariant.findMany({
    where: { id: { in: grouped.map((g) => g.variantId) } },
    select: { id: true, ...variantLabel },
  });
  const info = new Map(variants.map((v) => [v.id, v]));

  const byModel = new Map<string, TopSellerModel>();
  for (const g of grouped) {
    const v = info.get(g.variantId);
    if (!v) continue;
    const units = g._sum.quantity ?? 0;
    const revenue = g._sum.lineTotal ?? 0;
    let model = byModel.get(v.product.id);
    if (!model) {
      model = { rank: 0, productId: v.product.id, modelCode: v.product.modelCode, name: v.product.name, units: 0, revenue: 0, variants: [] };
      byModel.set(v.product.id, model);
    }
    model.units += units;
    model.revenue += revenue;
    model.variants.push({ variantId: v.id, sku: v.sku, color: v.color.name, size: v.size.code, units, revenue });
  }

  const ranked = [...byModel.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.modelCode.localeCompare(b.modelCode));
  for (const m of ranked) m.variants.sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.sku.localeCompare(b.sku));
  ranked.forEach((m, i) => {
    const prev = ranked[i - 1];
    m.rank = prev && prev.units === m.units && prev.revenue === m.revenue ? prev.rank : i + 1;
  });

  return {
    from,
    to,
    models: ranked.slice(0, limit),
    totalModels: ranked.length,
    totalUnits: ranked.reduce((a, m) => a + m.units, 0),
    totalRevenue: ranked.reduce((a, m) => a + m.revenue, 0),
  };
}

/**
 * Variantes con stock (en mano > 0 en alguna ubicación) y sin ventas en los últimos N días (`settings.no_rotation_days`,
 * contando hoy). No se excluyen las prendas recién ingresadas (supuesto a validar con Belén: P-24).
 * Orden: primero las que nunca se han vendido, luego las de más días sin vender; a igual antigüedad, la de más stock.
 */
export async function getNoRotation(input: { actor: Actor; now?: Date }): Promise<NoRotation> {
  assertReportsAccess(input.actor);
  const now = input.now ?? new Date();
  const days = await readPositiveIntSetting(SETTING_NO_ROTATION_DAYS, DEFAULT_NO_ROTATION_DAYS);
  const { fromKey, toKey } = lastDaysRange(now, days);

  const levels = await db.stockLevel.findMany({
    where: { onHand: { gt: 0 }, location: { active: true }, variant: { active: true, product: { active: true } } },
    select: {
      onHand: true,
      location: { select: { code: true, name: true } },
      variant: { select: { id: true, ...variantLabel } },
    },
  });
  if (levels.length === 0) return { days, sinceDay: fromKey, rows: [] };

  const stocked = new Map<string, { variant: (typeof levels)[number]["variant"]; byLocation: NoRotationRow["byLocation"] }>();
  for (const l of levels) {
    const entry = stocked.get(l.variant.id) ?? { variant: l.variant, byLocation: [] };
    entry.byLocation.push({ code: l.location.code, name: l.location.name, onHand: l.onHand });
    stocked.set(l.variant.id, entry);
  }

  // Ventas de esas variantes: la más reciente decide si rotan (dentro de la ventana) y da la "última venta".
  const lines = await db.saleLine.findMany({
    where: { variantId: { in: [...stocked.keys()] }, sale: productSaleWhere({ gte: new Date(0), lt: new Date(now.getTime() + 1) }) },
    select: { variantId: true, sale: { select: { createdAt: true } } },
  });
  const lastSale = new Map<string, Date>();
  for (const l of lines) {
    const prev = lastSale.get(l.variantId);
    if (!prev || l.sale.createdAt > prev) lastSale.set(l.variantId, l.sale.createdAt);
  }

  const rows: NoRotationRow[] = [];
  for (const [variantId, { variant, byLocation }] of stocked) {
    const last = lastSale.get(variantId) ?? null;
    if (last && santiagoDayKey(last) >= fromKey) continue; // vendió dentro de la ventana
    rows.push({
      variantId,
      sku: variant.sku,
      productName: variant.product.name,
      color: variant.color.name,
      size: variant.size.code,
      totalOnHand: byLocation.reduce((a, b) => a + b.onHand, 0),
      byLocation: byLocation.sort((a, b) => a.code.localeCompare(b.code)),
      lastSaleAt: last,
      daysSinceLastSale: last ? daysBetweenKeys(santiagoDayKey(last), toKey) : null,
    });
  }
  rows.sort(
    (a, b) =>
      (b.daysSinceLastSale ?? Number.POSITIVE_INFINITY) - (a.daysSinceLastSale ?? Number.POSITIVE_INFINITY) ||
      b.totalOnHand - a.totalOnHand ||
      a.sku.localeCompare(b.sku),
  );
  return { days, sinceDay: fromKey, rows };
}

const STORE_CODE = "TIENDA_RANCAGUA";
const WAREHOUSE_CODE = "BODEGA";

/**
 * Lista sugerida del viernes: qué llevar de BODEGA a TIENDA_RANCAGUA (solo se muestra e imprime; no crea el traslado).
 *   sugerido = min(disponible en bodega, max(0, ventas de la tienda en los últimos N días − disponible en tienda))
 * con N = `settings.friday_list_days` (contando hoy) y disponible = en mano − reservado: lo reservado nunca se sugiere.
 * "Ya en tránsito a la tienda" es informativo: no se resta (supuesto a validar con Belén: P-24).
 */
export async function getFridayList(input: { actor: Actor; now?: Date }): Promise<FridayList> {
  assertReportsAccess(input.actor);
  const now = input.now ?? new Date();
  const days = await readPositiveIntSetting(SETTING_FRIDAY_DAYS, DEFAULT_FRIDAY_DAYS);
  const { fromKey, toKey } = lastDaysRange(now, days);

  const locations = await db.location.findMany({
    where: { code: { in: [STORE_CODE, WAREHOUSE_CODE] }, active: true },
    select: { id: true, code: true, name: true },
  });
  const store = locations.find((l) => l.code === STORE_CODE) ?? null;
  const warehouse = locations.find((l) => l.code === WAREHOUSE_CODE) ?? null;
  const empty: FridayList = {
    days,
    fromDay: fromKey,
    toDay: toKey,
    from: warehouse && { code: warehouse.code, name: warehouse.name },
    to: store && { code: store.code, name: store.name },
    rows: [],
    totalUnits: 0,
  };
  if (!store || !warehouse) return empty;

  const sold = await db.saleLine.groupBy({
    by: ["variantId"],
    where: { sale: { ...productSaleWhere(windowOfDays(fromKey, toKey)), locationId: store.id } },
    _sum: { quantity: true },
  });
  if (sold.length === 0) return empty;
  const soldBy = new Map(sold.map((s) => [s.variantId, s._sum.quantity ?? 0]));
  const ids = [...soldBy.keys()];

  const [levels, variants, inTransit] = await Promise.all([
    db.stockLevel.findMany({
      where: { variantId: { in: ids }, locationId: { in: [store.id, warehouse.id] } },
      select: { variantId: true, locationId: true, onHand: true, reserved: true },
    }),
    db.productVariant.findMany({
      where: { id: { in: ids }, active: true, product: { active: true } },
      select: { id: true, ...variantLabel },
    }),
    db.transferLine.groupBy({
      by: ["variantId"],
      where: { variantId: { in: ids }, transfer: { status: "EN_TRANSITO", toLocationId: store.id } },
      _sum: { qtySent: true },
    }),
  ]);
  const available = (variantId: string, locationId: string) => {
    const l = levels.find((x) => x.variantId === variantId && x.locationId === locationId);
    return l ? l.onHand - l.reserved : 0;
  };
  const transitBy = new Map(inTransit.map((t) => [t.variantId, t._sum.qtySent ?? 0]));

  const rows: FridayRow[] = [];
  for (const v of variants) {
    const soldQty = soldBy.get(v.id) ?? 0;
    const storeAvailable = available(v.id, store.id);
    const warehouseAvailable = available(v.id, warehouse.id);
    const suggested = Math.min(Math.max(warehouseAvailable, 0), Math.max(0, soldQty - storeAvailable));
    if (suggested <= 0) continue;
    rows.push({
      variantId: v.id,
      sku: v.sku,
      productName: v.product.name,
      color: v.color.name,
      size: v.size.code,
      sold: soldQty,
      storeAvailable,
      warehouseAvailable,
      suggested,
      inTransitToStore: transitBy.get(v.id) ?? 0,
    });
  }
  rows.sort((a, b) => b.suggested - a.suggested || a.sku.localeCompare(b.sku));
  return { ...empty, rows, totalUnits: rows.reduce((a, r) => a + r.suggested, 0) };
}
