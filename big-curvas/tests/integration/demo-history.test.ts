import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetAndSeedDemoData } from "@/modules/demo";
import { getFridayList, getLowStock, getNoRotation, getSalesByPaymentMethod, getTopSellers } from "@/modules/reports";
import { expectInvariants, resetDemo } from "./helpers";

// Historial de demo (Etapa 6.5): ~8 semanas de ventas y pedidos generadas por los servicios reales.

const NOW = new Date("2026-10-28T19:00:00Z"); // miércoles 16:00 en Santiago

async function counts() {
  const [sales, voided, payments, orders, cash, movements] = await Promise.all([
    db.sale.count(),
    db.sale.count({ where: { status: "ANULADA" } }),
    db.payment.aggregate({ _sum: { amount: true } }),
    db.onlineOrder.count(),
    db.cashSession.count(),
    db.inventoryMovement.count(),
  ]);
  return { sales, voided, paid: payments._sum.amount, orders, cash, movements };
}

describe("historial de demo", () => {
  it("genera 8 semanas respetando las reglas, deja el stock de los casos de prueba y es repetible", async () => {
    const started = Date.now();
    const summary = await resetAndSeedDemoData({ history: true, now: NOW });
    const seconds = (Date.now() - started) / 1000;
    console.info(`[historial] ${summary.history?.posSales} ventas POS + ${summary.history?.orders} pedidos en ${seconds.toFixed(1)} s`);

    // Reglas de inventario: el ledger cuadra con el stock y las reservas con lo reservado.
    await expectInvariants();

    // El stock final es exactamente el de DEMO_PLAN.md (la carga inicial sumó lo que el historial vendió).
    const stock = async (sku: string) => {
      const v = await db.productVariant.findUniqueOrThrow({ where: { sku } });
      const levels = await db.stockLevel.findMany({ where: { variantId: v.id }, include: { location: true } });
      return Object.fromEntries(levels.map((l) => [l.location.code, [l.onHand, l.reserved]]));
    };
    expect(await stock("JMT012-AZU-48")).toEqual({ TIENDA_RANCAGUA: [1, 0], BODEGA: [8, 0] });
    expect(await stock("JMT012-NEG-48")).toEqual({ TIENDA_RANCAGUA: [0, 0], BODEGA: [6, 0] });
    expect(await stock("PBA041-NEG-XL")).toEqual({ TIENDA_RANCAGUA: [5, 0], BODEGA: [20, 0] });
    expect(await stock("CPU053-NEG-2XL")).toEqual({ TIENDA_RANCAGUA: [3, 0], BODEGA: [0, 0] });
    expect(await stock("BLM022-BUR-3XL")).toEqual({ TIENDA_RANCAGUA: [0, 0], BODEGA: [5, 0] });
    expect(await stock("VNE033-NEG-52")).toEqual({ TIENDA_RANCAGUA: [1, 0], BODEGA: [2, 0] });

    // Las cajas son secuenciales: ninguna queda abierta y hay una por día con ventas.
    expect(await db.cashSession.count({ where: { status: "ABIERTA" } })).toBe(0);
    expect(await db.cashSession.count()).toBe(summary.history!.days);
    // Ninguna fecha simulada queda en el futuro ni antes de las 8 semanas.
    const dates = await db.sale.aggregate({ _min: { createdAt: true }, _max: { createdAt: true } });
    expect(dates._max.createdAt!.getTime()).toBeLessThanOrEqual(NOW.getTime());
    expect(dates._min.createdAt!.getTime()).toBeGreaterThan(NOW.getTime() - 58 * 86_400_000);

    // Datos suficientes para los reportes: las 8 semanas, todos los medios de pago, ambos canales, anuladas y reembolsos.
    const actor = (await resetActors()).belen;
    const weekly = await getSalesByPaymentMethod({ actor, from: "2026-09-02", to: "2026-10-28", groupBy: "week" });
    expect(weekly.rows.filter((r) => r.count > 0).length).toBeGreaterThanOrEqual(8);
    expect(weekly.totals.efectivo).toBeGreaterThan(0);
    expect(weekly.totals.tarjeta).toBeGreaterThan(0);
    expect(weekly.totals.transferencia).toBeGreaterThan(0);
    expect(weekly.voided.count).toBeGreaterThan(0);
    expect(weekly.pendingRefunds.orders).toBe(summary.history!.pendingRefunds);
    const online = await getSalesByPaymentMethod({ actor, from: "2026-09-02", to: "2026-10-28", channel: "online" });
    expect(online.totals.count).toBeGreaterThan(0);
    expect((await getTopSellers({ actor, from: "2026-09-02", to: "2026-10-28" })).models.length).toBeGreaterThan(3);
    expect((await getNoRotation({ actor, now: NOW })).rows.length).toBeGreaterThan(0);
    expect((await getLowStock({ actor })).locations.some((l) => l.rows.length > 0)).toBe(true);
    expect((await getFridayList({ actor, now: NOW })).rows.length).toBeGreaterThan(0);

    // Determinista: repetirlo da lo mismo (mismo reloj → mismas ventas y montos).
    const first = await counts();
    await resetAndSeedDemoData({ history: true, now: NOW });
    expect(await counts()).toEqual(first);
    await expectInvariants();
  }, 180_000);

  it("sin la opción de historial el reinicio sigue dejando la BD sin ventas (los demás tests y db:seed no cambian)", async () => {
    await resetDemo();
    expect(await db.sale.count()).toBe(0);
    expect(await db.cashSession.count()).toBe(0);
  });
});

async function resetActors() {
  const belen = await db.user.findUniqueOrThrow({ where: { email: "belen@bigcurvas.demo" } });
  return { belen: { id: belen.id, role: belen.role, location: null } };
}
