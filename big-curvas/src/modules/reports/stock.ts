import { db } from "@/lib/db";
import type { Actor } from "@/lib/access";
import { DEFAULT_LOW_STOCK, SETTING_LOW_STOCK, assertReportsAccess, readNonNegativeIntSetting } from "./internal";
import type { LowStock, LowStockLocation } from "./types";

/**
 * Stock bajo por ubicación: variantes activas cuyo disponible (en mano − reservado) es el umbral o menos —incluidas las
 * agotadas (0)—. El umbral es `settings.low_stock_threshold`; un producto con `low_stock_threshold` propio usa el suyo
 * (igual que la matriz de Stock). Solo entran variantes con fila de stock en esa ubicación (es decir, que ya tuvieron
 * movimiento ahí). Orden: disponible ↑, luego SKU.
 */
export async function getLowStock(input: { actor: Actor }): Promise<LowStock> {
  assertReportsAccess(input.actor);
  const threshold = await readNonNegativeIntSetting(SETTING_LOW_STOCK, DEFAULT_LOW_STOCK);

  const [locations, levels] = await Promise.all([
    db.location.findMany({ where: { active: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    db.stockLevel.findMany({
      where: { location: { active: true }, variant: { active: true, product: { active: true } } },
      select: {
        locationId: true,
        onHand: true,
        reserved: true,
        variant: {
          select: {
            id: true,
            sku: true,
            size: { select: { code: true } },
            color: { select: { name: true } },
            product: { select: { name: true, lowStockThreshold: true } },
          },
        },
      },
    }),
  ]);

  const result: LowStockLocation[] = locations.map((loc) => {
    const rows = levels
      .filter((l) => l.locationId === loc.id)
      .map((l) => {
        const own = l.variant.product.lowStockThreshold;
        return {
          variantId: l.variant.id,
          sku: l.variant.sku,
          productName: l.variant.product.name,
          color: l.variant.color.name,
          size: l.variant.size.code,
          onHand: l.onHand,
          reserved: l.reserved,
          available: l.onHand - l.reserved,
          threshold: own ?? threshold,
          ownThreshold: own !== null,
        };
      })
      .filter((r) => r.available <= r.threshold)
      .sort((a, b) => a.available - b.available || a.sku.localeCompare(b.sku));
    return { locationId: loc.id, code: loc.code, name: loc.name, rows };
  });
  return { threshold, locations: result };
}
