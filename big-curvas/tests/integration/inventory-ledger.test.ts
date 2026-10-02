import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  adjustStock,
  consumeReservations,
  createTransferCommand,
  getKardex,
  getStockMatrix,
  receiveStock,
  receiveTransferCommand,
  releaseReservations,
  reserve,
  sell,
  sendTransferCommand,
} from "@/modules/inventory";
import { expectInvariants, newKey, resetDemo, tx, type Fixtures } from "./helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

describe("ledger", () => {
  it("tras una jornada mixta (con operaciones fallidas incluidas) el ledger cuadra en TODAS las filas", async () => {
    const a = await f.variant("PBA041-NEG-XL");
    const b = await f.variant("JMT012-AZU-48");
    const c = await f.variant("BLM022-BUR-3XL");
    const ignore = (p: Promise<unknown>) => p.catch(() => undefined);

    await tx((t) => sell(t, { actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, lines: [{ variantId: a, qty: 2 }, { variantId: b, qty: 1 }], saleId: "s1", idempotencyKey: newKey() }));
    await ignore(tx((t) => sell(t, { actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, lines: [{ variantId: b, qty: 1 }], saleId: "s2", idempotencyKey: newKey() })));
    await receiveStock({ actor: f.actors.bodega, locationId: f.loc.BODEGA, lines: [{ variantId: c, qty: 10 }], idempotencyKey: newKey() });
    await adjustStock({ actor: f.actors.belen, locationId: f.loc.TIENDA_RANCAGUA, variantId: a, delta: -1, reason: "Dañada", idempotencyKey: newKey() });
    const [r1, r2] = await tx((t) =>
      reserve(t, { actor: f.actors.belen, lines: [{ variantId: a, locationId: f.loc.BODEGA, qty: 2 }, { variantId: c, locationId: f.loc.BODEGA, qty: 1 }] }),
    );
    await tx((t) => consumeReservations(t, { actor: f.actors.bodega, reservationIds: [r1.id], idempotencyKey: newKey() }));
    await tx((t) => releaseReservations(t, { actor: f.actors.belen, reservationIds: [r2.id], reason: "Cancelado" }));
    const { result: tr } = await createTransferCommand({
      actor: f.actors.bodega,
      fromLocationId: f.loc.BODEGA,
      toLocationId: f.loc.TIENDA_RANCAGUA,
      lines: [{ variantId: c, qty: 4 }, { variantId: a, qty: 3 }],
      idempotencyKey: newKey(),
    });
    await sendTransferCommand({ actor: f.actors.bodega, transferId: tr.id, idempotencyKey: newKey() });
    await receiveTransferCommand({ actor: f.actors.vendRga, transferId: tr.id, lines: [{ variantId: c, qty: 3 }, { variantId: a, qty: 3 }], idempotencyKey: newKey() });
    await ignore(adjustStock({ actor: f.actors.belen, locationId: f.loc.TIENDA_RANCAGUA, variantId: b, delta: -1, reason: "Sin stock", idempotencyKey: newKey() }));

    await expectInvariants();

    // Cada saldo del kardex es el acumulado de los movimientos anteriores de esa fila
    const movements = await db.inventoryMovement.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const running = new Map<string, number>();
    for (const m of movements) {
      const k = `${m.variantId}|${m.locationId}`;
      const next = (running.get(k) ?? 0) + m.quantity;
      expect(m.onHandAfter, `saldo de ${m.type} ${m.idempotencyKey}`).toBe(next);
      running.set(k, next);
    }
  });
});

describe("consultas", () => {
  it("matriz: búsqueda por SKU, disponible = físico − reservado, en tránsito y total", async () => {
    const v = await f.variant("VNE033-NEG-52"); // 1 / 1 / 2
    await tx((t) => reserve(t, { actor: f.actors.belen, lines: [{ variantId: v, locationId: f.loc.BODEGA, qty: 1 }] }));
    const { result: tr } = await createTransferCommand({
      actor: f.actors.vendRga,
      fromLocationId: f.loc.TIENDA_RANCAGUA,
      toLocationId: f.loc.BODEGA,
      lines: [{ variantId: v, qty: 1 }],
      idempotencyKey: newKey(),
    });
    await sendTransferCommand({ actor: f.actors.vendRga, transferId: tr.id, idempotencyKey: newKey() });

    const rows = await getStockMatrix({ search: "vne033-neg-52" });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.byLocation[f.loc.BODEGA]).toEqual({ onHand: 2, reserved: 1, available: 1 });
    expect(row.byLocation[f.loc.TIENDA_RANCAGUA]).toEqual({ onHand: 0, reserved: 0, available: 0 });
    expect(row.inTransit).toBe(1);
    expect(row.total).toBe(0 + 2 + 1);

    expect((await getStockMatrix({ search: "Jeans Mom" })).every((r) => r.productName === "Jeans Mom Tiro Alto")).toBe(true);
  });

  it("kardex: más reciente primero, filtrable por ubicación, con usuario y saldo", async () => {
    const v = await f.variant("PBA041-NEG-XL");
    await tx((t) => sell(t, { actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, lines: [{ variantId: v, qty: 1 }], saleId: "s", idempotencyKey: newKey() }));
    const all = await getKardex({ variantId: v });
    expect(all.movements).toHaveLength(3); // 2 cargas iniciales (Rancagua, Bodega) + la venta
    expect(all.movements[0]).toMatchObject({ type: "VENTA_POS", quantity: -1, onHandAfter: 4, userName: "Vendedora Rancagua", locationName: "Tienda Rancagua" });

    const rga = await getKardex({ variantId: v, locationId: f.loc.TIENDA_RANCAGUA });
    expect(rga.movements.map((m) => m.type)).toEqual(["VENTA_POS", "CARGA_INICIAL"]);
  });
});
