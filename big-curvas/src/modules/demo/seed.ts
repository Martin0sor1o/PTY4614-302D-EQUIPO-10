import { db, type Tx } from "@/lib/db";
import { isDemoMode } from "@/lib/demo";
import { AppError } from "@/lib/errors";
import { MovementType, RefType } from "@/generated/prisma/client";
import {
  CATEGORIES,
  COLORS,
  DEMO_SETTINGS,
  LOCATIONS,
  PRODUCTS,
  SIZES,
  STOCK_OVERRIDES,
  USERS,
  type LocationDef,
  type StockTriple,
} from "./seed-data";

// DEMO: reinicia y carga los datos de ejemplo. Vacía las tablas de la app: solo con DEMO_MODE=true.

const ALL_TABLES = [
  "audit_log",
  "document_counters",
  "settings",
  "payments",
  "sale_lines",
  "sales",
  "cash_sessions",
  "approval_requests",
  "transfer_lines",
  "transfers",
  "reservations",
  "online_order_lines",
  "online_orders",
  "customers",
  "inventory_movements",
  "stock_levels",
  "product_variants",
  "products",
  "colors",
  "sizes",
  "categories",
  "users",
  "locations",
] as const;

/** Generador pseudoaleatorio determinista (mulberry32) para que el stock sea siempre el mismo. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** EAN-13 con prefijo 780 (Chile) y dígito verificador válido. */
export function ean13(index: number): string {
  const base = `780${String(100000 + index * 37).padStart(9, "0")}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  return `${base}${(10 - (sum % 10)) % 10}`;
}

function randomStock(sku: string): StockTriple {
  const rnd = seededRandom(hashString(sku));
  const store = () => {
    const r = rnd();
    if (r < 0.18) return 0;
    if (r < 0.33) return 1;
    return 2 + Math.floor(rnd() * 5); // 2–6
  };
  const bodega = () => (rnd() < 0.08 ? 0 : 4 + Math.floor(rnd() * 11)); // 0 o 4–14
  return { TIENDA_RANCAGUA: store(), TIENDA_PROVIDENCIA: store(), BODEGA: bodega() };
}

export interface LedgerMismatch {
  variantId: string;
  locationId: string;
  onHand: number;
  ledgerSum: number;
}

/** Invariante: SUM(inventory_movements.quantity) por (variante, ubicación) = stock_levels.on_hand. */
export async function findLedgerMismatches(client: Pick<Tx, "$queryRaw"> = db): Promise<LedgerMismatch[]> {
  const rows = await client.$queryRaw<
    { variant_id: string; location_id: string; on_hand: number; ledger_sum: bigint }[]
  >`
    SELECT sl.variant_id, sl.location_id, sl.on_hand, COALESCE(SUM(m.quantity), 0) AS ledger_sum
    FROM stock_levels sl
    LEFT JOIN inventory_movements m
      ON m.variant_id = sl.variant_id AND m.location_id = sl.location_id
    GROUP BY sl.variant_id, sl.location_id, sl.on_hand
    HAVING sl.on_hand <> COALESCE(SUM(m.quantity), 0)
  `;
  return rows.map((r) => ({
    variantId: r.variant_id,
    locationId: r.location_id,
    onHand: r.on_hand,
    ledgerSum: Number(r.ledger_sum),
  }));
}

export interface SeedSummary {
  locations: number;
  users: number;
  products: number;
  variants: number;
  unitsByLocation: Record<string, number>;
  ledgerMismatches: number;
}

export async function resetAndSeedDemoData(): Promise<SeedSummary> {
  if (!isDemoMode()) {
    throw new AppError("FORBIDDEN", "El reinicio de datos solo está disponible con DEMO_MODE=true.");
  }

  return db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`TRUNCATE TABLE ${ALL_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);

      // Ubicaciones y usuarios
      const locationByCode = new Map<LocationDef["code"], string>();
      for (const l of LOCATIONS) {
        const row = await tx.location.create({ data: l });
        locationByCode.set(l.code, row.id);
      }
      const userIds = new Map<string, string>();
      for (const u of USERS) {
        const row = await tx.user.create({
          data: {
            name: u.name,
            email: u.email,
            role: u.role,
            locationId: u.locationCode ? locationByCode.get(u.locationCode)! : null,
          },
        });
        userIds.set(u.key, row.id);
      }
      const adminId = userIds.get("belen")!;

      // Configuración (valores marcados como demo donde corresponde)
      await tx.setting.createMany({ data: DEMO_SETTINGS });

      // Catálogo maestro
      const categoryIds = new Map<string, string>();
      for (const name of CATEGORIES) categoryIds.set(name, (await tx.category.create({ data: { name } })).id);
      const sizeIds = new Map<string, string>();
      for (const s of SIZES) sizeIds.set(s.code, (await tx.size.create({ data: s })).id);
      const colorIds = new Map<string, string>();
      for (const c of COLORS) colorIds.set(c.code, (await tx.color.create({ data: c })).id);

      // Productos y variantes
      const stockBySku = new Map<string, StockTriple>();
      const variantRows: { id: string; sku: string }[] = [];
      let barcodeIndex = 0;
      for (const p of PRODUCTS) {
        const product = await tx.product.create({
          data: {
            modelCode: p.model,
            name: p.name,
            categoryId: categoryIds.get(p.category)!,
            basePrice: p.price,
            baseCost: Math.round((p.price * 0.42) / 10) * 10,
            lowStockThreshold: 2,
          },
        });
        for (const color of p.colors) {
          for (const size of p.sizes) {
            const sku = `${p.model}-${color}-${size}`;
            const variant = await tx.productVariant.create({
              data: {
                productId: product.id,
                sizeId: sizeIds.get(size)!,
                colorId: colorIds.get(color)!,
                sku,
                barcode: p.barcodeSource === "INTERNO" ? sku : ean13(barcodeIndex++),
                barcodeSource: p.barcodeSource,
              },
            });
            variantRows.push({ id: variant.id, sku });
            stockBySku.set(sku, STOCK_OVERRIDES[sku] ?? randomStock(sku));
          }
        }
      }
      for (const sku of Object.keys(STOCK_OVERRIDES)) {
        if (!variantRows.some((v) => v.sku === sku)) throw new Error(`STOCK_OVERRIDES: la variante ${sku} no existe`);
      }

      // SEED: escritura directa de stock_levels e inventory_movements (CARGA_INICIAL).
      // Excepción TEMPORAL a la regla 1 (solo InventoryService escribe stock): el servicio llega en la Etapa 2,
      // donde este bloque se migra a InventoryService (ver docs/DEMO_PLAN.md).
      const stockLevels: { variantId: string; locationId: string; onHand: number }[] = [];
      const movements: {
        variantId: string;
        locationId: string;
        type: MovementType;
        quantity: number;
        onHandAfter: number;
        reason: string;
        refType: RefType;
        userId: string;
        idempotencyKey: string;
      }[] = [];
      const unitsByLocation: Record<string, number> = {};

      for (const v of variantRows) {
        const triple = stockBySku.get(v.sku)!;
        for (const loc of LOCATIONS) {
          const qty = triple[loc.code];
          const locationId = locationByCode.get(loc.code)!;
          stockLevels.push({ variantId: v.id, locationId, onHand: qty });
          unitsByLocation[loc.code] = (unitsByLocation[loc.code] ?? 0) + qty;
          if (qty > 0) {
            movements.push({
              variantId: v.id,
              locationId,
              type: MovementType.CARGA_INICIAL,
              quantity: qty,
              onHandAfter: qty,
              reason: "Carga inicial (datos de demo)",
              refType: RefType.MANUAL,
              userId: adminId,
              idempotencyKey: `seed:initial:${v.id}:${locationId}`,
            });
          }
        }
      }
      await tx.stockLevel.createMany({ data: stockLevels });
      await tx.inventoryMovement.createMany({ data: movements });

      const mismatches = await findLedgerMismatches(tx);
      if (mismatches.length > 0) {
        throw new Error(`El ledger no cuadra tras la carga inicial: ${mismatches.length} diferencias`);
      }

      return {
        locations: LOCATIONS.length,
        users: USERS.length,
        products: PRODUCTS.length,
        variants: variantRows.length,
        unitsByLocation,
        ledgerMismatches: mismatches.length,
      };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
