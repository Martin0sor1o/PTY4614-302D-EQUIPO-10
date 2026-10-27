import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getFridayList,
  getLowStock,
  getNoRotation,
  getSalesByPaymentMethod,
  getSalesSummaryCards,
  getTopSellers,
} from "@/modules/reports";
import { expectAppError, resetDemo, type Fixtures } from "./helpers";
import { openRgaCash, posSale, santiago, stockUp } from "./reports-helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

type Actor = Fixtures["actors"][keyof Fixtures["actors"]];
const range = { from: "2026-10-01", to: "2026-10-28" };

/** Todas las consultas públicas del módulo, para ejecutarlas con cualquier actor. */
const queries: [string, (actor: Actor) => Promise<unknown>][] = [
  ["getSalesSummaryCards", (actor) => getSalesSummaryCards({ actor })],
  ["getSalesByPaymentMethod", (actor) => getSalesByPaymentMethod({ actor, ...range })],
  ["getTopSellers", (actor) => getTopSellers({ actor, ...range })],
  ["getLowStock", (actor) => getLowStock({ actor })],
  ["getNoRotation", (actor) => getNoRotation({ actor })],
  ["getFridayList", (actor) => getFridayList({ actor })],
];

describe("acceso a los reportes (solo ADMIN)", () => {
  for (const [name, run] of queries) {
    it(`${name}: la vendedora de Rancagua es rechazada en el servidor`, async () => {
      await expectAppError(run(f.actors.vendRga), "FORBIDDEN");
      await expectAppError(run(f.actors.vendRga2), "FORBIDDEN");
    });

    it(`${name}: el rol BODEGA también es rechazado y Belén puede`, async () => {
      await expectAppError(run(f.actors.bodega), "FORBIDDEN");
      await expect(run(f.actors.belen)).resolves.toBeDefined();
    });
  }

  it("el rechazo ocurre antes de validar los datos (un rango inválido tampoco filtra información a la vendedora)", async () => {
    await expectAppError(getSalesByPaymentMethod({ actor: f.actors.vendRga, from: "basura", to: "2026-10-28" }), "FORBIDDEN");
    await expectAppError(getTopSellers({ actor: f.actors.vendRga, from: "2026-10-28", to: "2026-10-01" }), "FORBIDDEN");
  });
});

describe("los reportes no modifican el inventario (regla 1)", () => {
  it("el conteo y el contenido de movimientos, stock, reservas y traslados no cambian al correr todos los reportes", async () => {
    // Historial para que los reportes tengan algo que leer.
    await stockUp(f, "PBA041-NEG-XL", "TIENDA_RANCAGUA", 10);
    await openRgaCash(f);
    await posSale(f, { sku: "PBA041-NEG-XL", qty: 3, method: "EFECTIVO", at: santiago("2026-10-27", "11:00") });
    await posSale(f, { sku: "JMT012-AZU-48", qty: 1, method: "TRANSFERENCIA", at: santiago("2026-10-26", "18:00") });

    const snapshot = async () => ({
      movements: await db.inventoryMovement.findMany({ orderBy: { id: "asc" } }),
      stock: await db.stockLevel.findMany({ orderBy: [{ variantId: "asc" }, { locationId: "asc" }] }),
      reservations: await db.reservation.findMany({ orderBy: { id: "asc" } }),
      transfers: await db.transfer.count(),
      transferLines: await db.transferLine.count(),
      sales: await db.sale.count(),
      settings: await db.setting.findMany({ orderBy: { key: "asc" } }),
    });
    const before = await snapshot();
    expect(before.movements.length).toBeGreaterThan(0);

    for (const [, run] of queries) await run(f.actors.belen);
    // Dos veces: leer no debe cambiar nada ni acumular efectos.
    for (const [, run] of queries) await run(f.actors.belen);

    expect(await snapshot()).toEqual(before);
  });
});
