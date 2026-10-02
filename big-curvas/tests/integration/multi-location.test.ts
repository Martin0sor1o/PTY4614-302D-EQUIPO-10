import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/access";
import {
  createTransferCommand,
  getStockMatrix,
  receiveStock,
  receiveTransferCommand,
  sendTransferCommand,
} from "@/modules/inventory";
import { listLocations } from "@/modules/locations";
import { closeCashSession, createSale, listSalesOfDay, openCashSession } from "@/modules/sales";
import { createExtraStore, expectAppError, expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";

// El modelo es multi-ubicación (ADR-017): hoy la demo trae solo Tienda Rancagua + Bodega, pero nada está atado a
// esas dos. Cada test crea una tienda extra dentro del test; no se borra (sin borrado físico y el ledger es
// inmutable): la BD de test se vacía en el próximo resetDemo(), como el resto de los datos.

const PBA_XL = "PBA041-NEG-XL"; // Rancagua 5 · Bodega 20 (la tienda extra parte en 0)

let f: Fixtures;
let extra: { id: string; code: string };
let vendExtra: Actor;
beforeEach(async () => {
  f = await resetDemo();
  extra = await createExtraStore();
  const user = await db.user.create({
    data: { name: "Vendedora Extra", email: "extra@bigcurvas.test", role: "VENDEDORA", locationId: extra.id },
    include: { location: true },
  });
  vendExtra = {
    id: user.id,
    role: user.role,
    location: { id: extra.id, code: user.location!.code, name: user.location!.name, type: user.location!.type },
  };
});

const card = () => ({ method: "DEBITO" as const, reference: "V-1" });

async function sellOne(actor: Actor, locationId: string) {
  return createSale({
    actor,
    locationId,
    lines: [{ variantId: await f.variant(PBA_XL), qty: 1, discountBps: 0 }],
    payment: card(),
    idempotencyKey: newKey(),
  });
}

describe("N ubicaciones: inventario", () => {
  it("la tienda extra aparece en las ubicaciones activas (tiendas primero, bodega al final) y en la matriz de stock", async () => {
    const locations = await listLocations();
    expect(locations.map((l) => l.code)).toEqual(["TIENDA_EXTRA", "TIENDA_RANCAGUA", "BODEGA"]);

    await receiveStock({ actor: f.actors.belen, locationId: extra.id, lines: [{ variantId: await f.variant(PBA_XL), qty: 4 }], idempotencyKey: newKey() });
    const [row] = await getStockMatrix({ search: PBA_XL });
    expect(row.byLocation[extra.id]).toEqual({ onHand: 4, reserved: 0, available: 4 });
    expect(row.byLocation[f.loc.TIENDA_RANCAGUA]).toEqual({ onHand: 5, reserved: 0, available: 5 });
    expect(row.byLocation[f.loc.BODEGA]).toEqual({ onHand: 20, reserved: 0, available: 20 });
    expect(row.total).toBe(4 + 5 + 20);
    await expectInvariants();
  });

  it("traspaso Bodega → tienda extra con diferencia: baja al enviar, sube lo escaneado y la diferencia queda en el traspaso", async () => {
    const v = await f.variant(PBA_XL);
    const { result: t } = await createTransferCommand({
      actor: f.actors.belen,
      fromLocationId: f.loc.BODEGA,
      toLocationId: extra.id,
      lines: [{ variantId: v, qty: 3 }],
      idempotencyKey: newKey(),
    });
    await sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey() });
    expect(await stockOf(v, f.loc.BODEGA)).toEqual({ onHand: 17, reserved: 0 });

    // Solo la vendedora de la tienda de destino recibe; la de Rancagua no
    await expectAppError(
      receiveTransferCommand({ actor: f.actors.vendRga, transferId: t.id, lines: [{ variantId: v, qty: 2 }], idempotencyKey: newKey() }),
      "FORBIDDEN",
    );
    const { result } = await receiveTransferCommand({
      actor: vendExtra,
      transferId: t.id,
      lines: [{ variantId: v, qty: 2 }],
      idempotencyKey: newKey(),
    });
    expect(result.transfer.status).toBe("RECIBIDO_CON_DIFERENCIAS");
    expect(await stockOf(v, extra.id)).toEqual({ onHand: 2, reserved: 0 });
    expect(await stockOf(v, f.loc.BODEGA)).toEqual({ onHand: 17, reserved: 0 }); // la diferencia no se ajusta sola
    await expectInvariants();
  });
});

describe("N ubicaciones: ventas y caja", () => {
  it("cada tienda tiene su caja y su correlativo (EXT-000001 aunque Rancagua ya vendió)", async () => {
    await openCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, openingCash: 50_000 });
    await openCashSession({ actor: vendExtra, locationId: extra.id, openingCash: 30_000 });
    await receiveStock({ actor: f.actors.belen, locationId: extra.id, lines: [{ variantId: await f.variant(PBA_XL), qty: 2 }], idempotencyKey: newKey() });

    const { result: rga } = await sellOne(f.actors.vendRga, f.loc.TIENDA_RANCAGUA);
    const { result: ext } = await sellOne(vendExtra, extra.id);
    expect(rga.number).toBe("RGA-000001");
    expect(ext.number).toBe("EXT-000001");

    // ventas del día separadas por tienda
    expect((await listSalesOfDay({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA })).count).toBe(1);
    expect((await listSalesOfDay({ actor: vendExtra, locationId: extra.id })).count).toBe(1);

    // una caja por tienda: cerrar la de Rancagua no afecta a la extra
    await closeCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, countedCash: 50_000 });
    await sellOne(vendExtra, extra.id);
    await expectInvariants();
  });

  it("la caja abierta en otra tienda no habilita la venta; y cada vendedora solo vende en la suya", async () => {
    await openCashSession({ actor: vendExtra, locationId: extra.id, openingCash: 10_000 });
    await expectAppError(sellOne(f.actors.vendRga, f.loc.TIENDA_RANCAGUA), "CONFLICT", /caja/i); // Rancagua sin caja

    await openCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, openingCash: 10_000 });
    await expectAppError(sellOne(f.actors.vendRga, extra.id), "FORBIDDEN");
    await expectAppError(sellOne(vendExtra, f.loc.TIENDA_RANCAGUA), "FORBIDDEN");
    expect(await db.sale.count()).toBe(0);
  });
});
