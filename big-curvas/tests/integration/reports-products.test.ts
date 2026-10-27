import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createTransferCommand, sendTransferCommand } from "@/modules/inventory";
import { cancelOrder } from "@/modules/orders";
import { getFridayList, getLowStock, getNoRotation, getTopSellers } from "@/modules/reports";
import { voidSale } from "@/modules/sales";
import { confirmTestPayment, registerTestOrder } from "./orders-helpers";
import { expectAppError, newKey, resetDemo, type Fixtures } from "./helpers";
import { backdateSale, openRgaCash, posSale, reserveUnits, santiago, stockUp } from "./reports-helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const PBA = "PBA041-NEG-XL"; // $8.990 · Rancagua 5 · Bodega 20
const AZU = "JMT012-AZU-48"; // $29.990 · Rancagua 1 · Bodega 8
const NEG = "JMT012-NEG-48"; // $29.990 · Rancagua 0 · Bodega 6
const CPU = "CPU053-NEG-2XL"; // $49.990 · Rancagua 3 · Bodega 0
const VNE = "VNE033-NEG-52"; // Rancagua 1 · Bodega 2

const NOW = santiago("2026-10-28", "12:00");
const daysAgo = (n: number, time = "11:00") => {
  const d = new Date(`2026-10-28T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return santiago(d.toISOString().slice(0, 10), time);
};

describe("más vendidos", () => {
  it("ranking por modelo con detalle por variante; empate exacto comparte puesto; excluye anuladas, pedidos cancelados y fuera de período", async () => {
    const vfl = (await db.productVariant.findFirstOrThrow({ where: { sku: { startsWith: "VFL032" } }, orderBy: { sku: "asc" } })).sku;
    for (const sku of [PBA, AZU, NEG, vfl]) await stockUp(f, sku, "TIENDA_RANCAGUA", 20);
    await openRgaCash(f);

    await posSale(f, { sku: PBA, qty: 5, at: daysAgo(3) });
    await posSale(f, { sku: AZU, qty: 2, at: daysAgo(2) });
    await posSale(f, { sku: NEG, qty: 1, at: daysAgo(2) });
    await posSale(f, { sku: vfl, qty: 3, at: daysAgo(1) }); // mismo precio que JMT012: 3 u. y el mismo ingreso → empate
    await posSale(f, { sku: PBA, qty: 9, at: daysAgo(40) }); // fuera del período pedido
    const voided = await posSale(f, { sku: vfl, qty: 4, at: new Date() });
    await voidSale({ actor: f.actors.belen, saleId: voided.id, reason: "Se equivocó de prenda", idempotencyKey: newKey("anular") });
    await backdateSale(voided.id, daysAgo(1)); // anulada: no cuenta
    // Pedido online cancelado con reembolso pendiente: la venta sigue COMPLETADA, pero la prenda no salió → no cuenta.
    const order = await registerTestOrder(f, [{ sku: NEG, qty: 3 }]);
    await confirmTestPayment(f, order.id);
    await cancelOrder({ actor: f.actors.belen, orderId: order.id, reason: "No quiere esperar", idempotencyKey: newKey("cancel") });
    // Pedido online vigente: sí cuenta, en el modelo PBA041
    const live = await registerTestOrder(f, [{ sku: PBA, qty: 1 }]);
    await confirmTestPayment(f, live.id);

    const top = await getTopSellers({ actor: f.actors.belen, from: "2026-10-01", to: "2026-10-28" });
    expect(top.models.map((m) => [m.rank, m.modelCode, m.units, m.revenue])).toEqual([
      [1, "PBA041", 6, 6 * 8990],
      [2, "JMT012", 3, 3 * 29990],
      [2, "VFL032", 3, 3 * 29990],
    ]);
    // Detalle por variante, la más vendida primero.
    expect(top.models[1].variants.map((v) => [v.sku, v.units, v.revenue])).toEqual([
      [AZU, 2, 2 * 29990],
      [NEG, 1, 29990],
    ]);
    expect(top.totalModels).toBe(3);
    expect(top.totalUnits).toBe(12);
    expect(top.totalRevenue).toBe(6 * 8990 + 6 * 29990);

    // El período decide: ampliarlo suma las 9 del día −40.
    const wide = await getTopSellers({ actor: f.actors.belen, from: "2026-08-01", to: "2026-10-28" });
    expect(wide.models[0]).toMatchObject({ modelCode: "PBA041", units: 15 });
    // Límite de filas
    const one = await getTopSellers({ actor: f.actors.belen, from: "2026-10-01", to: "2026-10-28", limit: 1 });
    expect(one.models).toHaveLength(1);
    expect(one.totalModels).toBe(3);
  });

  it("rango sin ventas: lista vacía y totales en cero", async () => {
    const top = await getTopSellers({ actor: f.actors.belen, from: "2026-01-01", to: "2026-01-31" });
    expect(top).toMatchObject({ models: [], totalModels: 0, totalUnits: 0, totalRevenue: 0 });
  });

  it("rango inválido → VALIDATION", async () => {
    await expectAppError(getTopSellers({ actor: f.actors.belen, from: "2026-10-28", to: "2026-10-01" }), "VALIDATION", /posterior/);
  });
});

describe("stock bajo", () => {
  beforeEach(async () => {
    // Sin umbral propio de los productos: rige settings.low_stock_threshold (2).
    await db.product.updateMany({ data: { lowStockThreshold: null } });
  });

  const rowsOf = async (code: "TIENDA_RANCAGUA" | "BODEGA") => {
    const r = await getLowStock({ actor: f.actors.belen });
    return r.locations.find((l) => l.code === code)!.rows;
  };

  it("lista por ubicación lo que tiene disponible ≤ umbral; descuenta lo reservado e incluye las agotadas", async () => {
    await reserveUnits(f, PBA, "TIENDA_RANCAGUA", 3); // 5 en mano − 3 reservadas = 2 disponibles
    const store = await rowsOf("TIENDA_RANCAGUA");
    const bySku = (rows: typeof store, sku: string) => rows.find((r) => r.sku === sku);

    expect(bySku(store, PBA)).toMatchObject({ onHand: 5, reserved: 3, available: 2, threshold: 2, ownThreshold: false });
    expect(bySku(store, AZU)).toMatchObject({ onHand: 1, available: 1 });
    expect(bySku(store, NEG)).toMatchObject({ onHand: 0, available: 0 }); // agotada
    expect(bySku(store, CPU)).toBeUndefined(); // 3 disponibles: sobre el umbral
    // Cada ubicación se evalúa por separado: la bodega tiene 8 de AZU y no aparece; VNE (2) sí.
    const warehouse = await rowsOf("BODEGA");
    expect(bySku(warehouse, AZU)).toBeUndefined();
    expect(bySku(warehouse, VNE)).toMatchObject({ onHand: 2, available: 2 });
    expect(bySku(warehouse, PBA)).toBeUndefined();
    // Todo lo listado cumple la regla y viene ordenado por disponible.
    for (const rows of [store, warehouse]) {
      expect(rows.every((r) => r.available <= r.threshold)).toBe(true);
      expect(rows.map((r) => r.available)).toEqual([...rows.map((r) => r.available)].sort((a, b) => a - b));
    }
    // Reservar el resto la deja agotada para vender.
    await reserveUnits(f, PBA, "TIENDA_RANCAGUA", 2);
    expect(bySku(await rowsOf("TIENDA_RANCAGUA"), PBA)).toMatchObject({ onHand: 5, reserved: 5, available: 0 });
  });

  it("con muchas variantes se ordena de menor a mayor disponible y, en empate, por SKU (sin recortar filas)", async () => {
    await db.product.updateMany({ data: { lowStockThreshold: 10 } }); // umbral alto: entra casi todo el catálogo
    for (const code of ["TIENDA_RANCAGUA", "BODEGA"] as const) {
      const rows = await rowsOf(code);
      expect(rows.length).toBeGreaterThan(30);
      const sorted = [...rows].sort((a, b) => a.available - b.available || a.sku.localeCompare(b.sku));
      expect(rows.map((r) => r.sku)).toEqual(sorted.map((r) => r.sku));
      // Las agotadas van primero y el último de la lista es el de mayor disponible.
      expect(rows[0].available).toBe(Math.min(...rows.map((r) => r.available)));
      expect(rows.at(-1)!.available).toBe(Math.max(...rows.map((r) => r.available)));
    }
  });

  it("el umbral sale de settings y un producto puede fijar el suyo", async () => {
    await db.setting.update({ where: { key: "low_stock_threshold" }, data: { valueInt: 1 } });
    let r = await getLowStock({ actor: f.actors.belen });
    expect(r.threshold).toBe(1);
    expect((await rowsOf("BODEGA")).find((x) => x.sku === VNE)).toBeUndefined(); // 2 > 1

    await db.product.update({ where: { modelCode: "VNE033" }, data: { lowStockThreshold: 10 } });
    r = await getLowStock({ actor: f.actors.belen });
    expect((await rowsOf("BODEGA")).find((x) => x.sku === VNE)).toMatchObject({ threshold: 10, ownThreshold: true });
  });
});

describe("sin rotación", () => {
  it("variantes con stock y sin ventas en los últimos N días (hoy incluido); la vendida no aparece", async () => {
    await stockUp(f, PBA, "TIENDA_RANCAGUA", 20);
    await stockUp(f, NEG, "TIENDA_RANCAGUA", 20);
    await stockUp(f, VNE, "TIENDA_RANCAGUA", 20);
    await openRgaCash(f);
    await posSale(f, { sku: PBA, at: daysAgo(10) }); // vendida hace 10 días → rota
    await posSale(f, { sku: VNE, at: daysAgo(59) }); // N = 60 cuenta hoy y 59 días atrás: aún rota
    await posSale(f, { sku: NEG, at: daysAgo(60) }); // un día más: sin rotación
    await posSale(f, { sku: CPU, qty: 3, at: daysAgo(90) }); // vendió todo: sin stock → no aparece aunque no rote

    const r = await getNoRotation({ actor: f.actors.belen, now: NOW });
    expect(r.days).toBe(60);
    const sku = (s: string) => r.rows.find((x) => x.sku === s);
    expect(sku(PBA)).toBeUndefined();
    expect(sku(VNE)).toBeUndefined();
    expect(sku(NEG)).toMatchObject({ daysSinceLastSale: 60, totalOnHand: 25 }); // 19 en la tienda (20 − 1 vendida) + 6 en bodega
    expect(sku(NEG)!.byLocation.map((l) => [l.code, l.onHand])).toEqual([["BODEGA", 6], ["TIENDA_RANCAGUA", 19]]);
    expect(sku(CPU)).toBeUndefined();
    // Una prenda con stock que nunca se vendió aparece, sin fecha de última venta, y va primero.
    expect(sku(AZU)).toMatchObject({ lastSaleAt: null, daysSinceLastSale: null });
    expect(r.rows[0].daysSinceLastSale).toBeNull();
    expect(r.rows.every((x) => x.totalOnHand > 0)).toBe(true);
  });

  it("N sale de settings; el pedido cancelado no cuenta como venta de la prenda", async () => {
    await stockUp(f, PBA, "TIENDA_RANCAGUA", 20);
    await openRgaCash(f);
    await posSale(f, { sku: PBA, at: daysAgo(20) });
    const order = await registerTestOrder(f, [{ sku: AZU }]);
    await confirmTestPayment(f, order.id);
    const sale = await db.sale.findUniqueOrThrow({ where: { onlineOrderId: order.id } });
    await backdateSale(sale.id, daysAgo(2));

    expect((await getNoRotation({ actor: f.actors.belen, now: NOW })).rows.some((x) => x.sku === PBA)).toBe(false); // 20 < 60
    await db.setting.update({ where: { key: "no_rotation_days" }, data: { valueInt: 10 } });
    const r = await getNoRotation({ actor: f.actors.belen, now: NOW });
    expect(r.days).toBe(10);
    expect(r.rows.find((x) => x.sku === PBA)).toMatchObject({ daysSinceLastSale: 20 });
    expect(r.rows.some((x) => x.sku === AZU)).toBe(false); // pedido vigente de hace 2 días: rota

    await cancelOrder({ actor: f.actors.belen, orderId: order.id, reason: "Sin respuesta", idempotencyKey: newKey("cancel") });
    const after = await getNoRotation({ actor: f.actors.belen, now: NOW });
    expect(after.rows.find((x) => x.sku === AZU)).toMatchObject({ lastSaleAt: null }); // la venta del pedido cancelado no cuenta
  });
});

describe("lista sugerida del viernes", () => {
  it("min(disponible en bodega, max(0, vendido − disponible en tienda)); nunca más que el disponible ni cuenta lo reservado", async () => {
    await stockUp(f, AZU, "TIENDA_RANCAGUA", 5); // tienda 6
    await stockUp(f, PBA, "TIENDA_RANCAGUA", 1); // tienda 6
    await stockUp(f, VNE, "TIENDA_RANCAGUA", 2); // tienda 3
    await openRgaCash(f);
    // Una venta anulada no cuenta como demanda (se anula el mismo día y luego se fecha dentro de la ventana).
    const voided = await posSale(f, { sku: VNE, qty: 1, at: new Date() });
    await voidSale({ actor: f.actors.belen, saleId: voided.id, reason: "Cambió de idea", idempotencyKey: newKey("anular") });
    await backdateSale(voided.id, daysAgo(1));
    await posSale(f, { sku: PBA, qty: 4, at: daysAgo(3) }); // tienda queda en 2; bodega 20 → min(20, 4 − 2) = 2
    await posSale(f, { sku: AZU, qty: 5, at: daysAgo(5) }); // tienda queda en 1; bodega 8 con 6 reservadas = 2 → min(2, 5 − 1) = 2
    await reserveUnits(f, AZU, "BODEGA", 6);
    await posSale(f, { sku: CPU, qty: 2, at: daysAgo(2) }); // bodega 0: nada que llevar
    await posSale(f, { sku: VNE, qty: 3, at: daysAgo(1) }); // tienda queda en 0; bodega 2 → min(2, 3 − 0) = 2
    await stockUp(f, NEG, "TIENDA_RANCAGUA", 5);
    await posSale(f, { sku: NEG, qty: 2, at: daysAgo(20) }); // fuera de la ventana de 14 días

    const list = await getFridayList({ actor: f.actors.belen, now: NOW });
    expect(list.days).toBe(14);
    expect(list.from?.code).toBe("BODEGA");
    expect(list.to?.code).toBe("TIENDA_RANCAGUA");
    const rows = Object.fromEntries(list.rows.map((r) => [r.sku, r]));
    expect(rows[PBA]).toMatchObject({ sold: 4, storeAvailable: 2, warehouseAvailable: 20, suggested: 2 });    expect(rows[AZU]).toMatchObject({ sold: 5, storeAvailable: 1, warehouseAvailable: 2, suggested: 2 });
    expect(rows[VNE]).toMatchObject({ sold: 3, storeAvailable: 0, warehouseAvailable: 2, suggested: 2 });
    expect(rows[CPU]).toBeUndefined();
    expect(rows[NEG]).toBeUndefined();
    expect(list.totalUnits).toBe(2 + 2 + 2);

    // Invariante: jamás sugiere más que el disponible de la bodega (en mano − reservado).
    for (const r of list.rows) {
      const level = await db.stockLevel.findUniqueOrThrow({ where: { variantId_locationId: { variantId: r.variantId, locationId: f.loc.BODEGA } } });
      expect(r.suggested).toBeLessThanOrEqual(level.onHand - level.reserved);
      expect(r.suggested).toBeGreaterThan(0);
    }
    // Orden: más unidades primero.
    expect(list.rows.map((r) => r.suggested)).toEqual([...list.rows.map((r) => r.suggested)].sort((a, b) => b - a));
  });

  it("la ventana sale de settings; lo que ya viaja a la tienda se informa pero no se resta", async () => {
    await openRgaCash(f);
    await posSale(f, { sku: PBA, qty: 5, at: daysAgo(20) });
    expect((await getFridayList({ actor: f.actors.belen, now: NOW })).rows).toEqual([]); // fuera de 14 días
    await db.setting.update({ where: { key: "friday_list_days" }, data: { valueInt: 30 } });

    const pba = await f.variant(PBA);
    const { result: draft } = await createTransferCommand({
      actor: f.actors.belen,
      fromLocationId: f.loc.BODEGA,
      toLocationId: f.loc.TIENDA_RANCAGUA,
      reason: "REPOSICION",
      lines: [{ variantId: pba, qty: 2 }],
      idempotencyKey: newKey("crear"),
    });
    await sendTransferCommand({ actor: f.actors.belen, transferId: draft.id, idempotencyKey: newKey("enviar") });

    const list = await getFridayList({ actor: f.actors.belen, now: NOW });
    expect(list.days).toBe(30);
    expect(list.rows.find((r) => r.sku === PBA)).toMatchObject({ sold: 5, storeAvailable: 0, warehouseAvailable: 18, suggested: 5, inTransitToStore: 2 });
  });
});
