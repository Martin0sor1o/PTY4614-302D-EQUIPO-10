import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { receiveStock, reserve, sell } from "@/modules/inventory";
import { countMovements, expectInvariants, newKey, resetDemo, stockOf, tx, type Fixtures } from "./helpers";

// Concurrencia real contra Postgres: cada $transaction usa su propia conexión del pool de pg (máx. 10 por
// defecto, ≥ 2 como exige el test). Las pausas con pg_sleep quedan muy por debajo del timeout de 5 s de la
// transacción interactiva de Prisma.

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const HOLD_SECONDS = 1;

function sellTx(fx: Fixtures, lines: { variantId: string; qty: number }[], opts: { holdAfter?: number; onLocked?: () => void } = {}) {
  return tx(async (t) => {
    const result = await sell(t, { actor: fx.actors.vendRga, locationId: fx.loc.TIENDA_RANCAGUA, lines, saleId: "s", idempotencyKey: newKey("venta") });
    opts.onLocked?.();
    if (opts.holdAfter) await t.$executeRaw`SELECT pg_sleep(${opts.holdAfter})`; // mantiene el bloqueo de fila abierto
    return result;
  });
}

function outcome(r: PromiseSettledResult<unknown>): string {
  if (r.status === "fulfilled") return "OK";
  return r.reason instanceof AppError ? r.reason.code : `ERROR ${String((r.reason as Error)?.message).slice(0, 200)}`;
}

describe("última unidad (JMT012-AZU-48 en Rancagua)", () => {
  it("dos ventas a la vez, con solapamiento forzado: la 2ª espera el bloqueo y falla con STOCK_INSUFICIENTE", async () => {
    const v = await f.variant("JMT012-AZU-48");
    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 0 });

    let firstLocked!: () => void;
    const locked = new Promise<void>((resolve) => (firstLocked = resolve));
    let firstCommittedAt = 0;

    const first = sellTx(f, [{ variantId: v, qty: 1 }], { holdAfter: HOLD_SECONDS, onLocked: () => firstLocked() }).then((r) => {
      firstCommittedAt = Date.now();
      return r;
    });
    await locked; // la 1ª ya descontó y tiene la fila bloqueada (sin COMMIT)
    const second = sellTx(f, [{ variantId: v, qty: 1 }]).finally(() => {
      // la 2ª no pudo terminar antes del COMMIT de la 1ª: estuvo esperando el bloqueo
      expect(firstCommittedAt).toBeGreaterThan(0);
    });

    const results = await Promise.allSettled([first, second]);
    expect(results.map(outcome)).toEqual(["OK", "STOCK_INSUFICIENTE"]);
    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 0, reserved: 0 });
    expect(await countMovements({ variantId: v, type: "VENTA_POS" })).toBe(1);
    await expectInvariants();
  });

  it("carrera sin pausas (5 ventas simultáneas de la última unidad): exactamente una gana", async () => {
    const v = await f.variant("JMT012-AZU-48");
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => sellTx(f, [{ variantId: v, qty: 1 }])));
    const outcomes = results.map(outcome);
    expect(outcomes.filter((o) => o === "OK")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "STOCK_INSUFICIENTE")).toHaveLength(4);
    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 0, reserved: 0 });
    expect(await countMovements({ variantId: v, type: "VENTA_POS" })).toBe(1);
    await expectInvariants();
  });

  it("venta POS vs. reserva de pedido online sobre la misma última unidad: solo una tiene éxito (RNF-01)", async () => {
    const v = await f.variant("JMT012-AZU-48");
    const results = await Promise.allSettled([
      sellTx(f, [{ variantId: v, qty: 1 }]),
      tx((t) => reserve(t, { actor: f.actors.belen, lines: [{ variantId: v, locationId: f.loc.TIENDA_RANCAGUA, qty: 1 }] })),
    ]);
    const outcomes = results.map(outcome);
    expect(outcomes.filter((o) => o === "OK")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "STOCK_INSUFICIENTE")).toHaveLength(1);
    const s = await stockOf(v, f.loc.TIENDA_RANCAGUA);
    expect(s.onHand - s.reserved).toBe(0);
    await expectInvariants();
  });
});

describe("multi-línea con las mismas variantes en orden inverso (sin deadlock)", () => {
  async function twoVariantsWithStock() {
    const a = await f.variant("PBA041-NEG-XL");
    const b = await f.variant("VNE033-NEG-52");
    await receiveStock({
      actor: f.actors.belen,
      locationId: f.loc.TIENDA_RANCAGUA,
      lines: [{ variantId: a, qty: 20 }, { variantId: b, qty: 20 }],
      idempotencyKey: newKey("recepcion"),
    });
    return { a, b, startA: (await stockOf(a, f.loc.TIENDA_RANCAGUA)).onHand, startB: (await stockOf(b, f.loc.TIENDA_RANCAGUA)).onHand };
  }

  it("con solapamiento forzado: la venta [B, A] espera a la [A, B] y ambas terminan OK", async () => {
    const { a, b, startA, startB } = await twoVariantsWithStock();
    let firstLocked!: () => void;
    const locked = new Promise<void>((resolve) => (firstLocked = resolve));

    const first = sellTx(f, [{ variantId: a, qty: 1 }, { variantId: b, qty: 1 }], { holdAfter: HOLD_SECONDS, onLocked: () => firstLocked() });
    await locked;
    const second = sellTx(f, [{ variantId: b, qty: 1 }, { variantId: a, qty: 1 }]);

    const results = await Promise.allSettled([first, second]);
    expect(results.map(outcome)).toEqual(["OK", "OK"]);
    expect(await stockOf(a, f.loc.TIENDA_RANCAGUA)).toMatchObject({ onHand: startA - 2 });
    expect(await stockOf(b, f.loc.TIENDA_RANCAGUA)).toMatchObject({ onHand: startB - 2 });
    await expectInvariants();
  });

  it("ráfaga de 4 pares [A, B] / [B, A] simultáneos: todas OK, ningún deadlock (40P01)", async () => {
    const { a, b, startA, startB } = await twoVariantsWithStock();
    const sales = Array.from({ length: 4 }, () => [
      sellTx(f, [{ variantId: a, qty: 1 }, { variantId: b, qty: 1 }]),
      sellTx(f, [{ variantId: b, qty: 1 }, { variantId: a, qty: 1 }]),
    ]).flat();
    const outcomes = (await Promise.allSettled(sales)).map(outcome);
    expect(outcomes).toEqual(Array(8).fill("OK"));
    expect(await stockOf(a, f.loc.TIENDA_RANCAGUA)).toMatchObject({ onHand: startA - 8 });
    expect(await stockOf(b, f.loc.TIENDA_RANCAGUA)).toMatchObject({ onHand: startB - 8 });
    await expectInvariants();
  });
});

describe("red de seguridad en la BD", () => {
  it("el CHECK impide stock negativo aunque alguien salte el servicio", async () => {
    const v = await f.variant("JMT012-AZU-48");
    await expect(
      db.$executeRaw`UPDATE stock_levels SET on_hand = on_hand - 5 WHERE variant_id = ${v} AND location_id = ${f.loc.TIENDA_RANCAGUA}`,
    ).rejects.toThrow(/stock_levels_on_hand_chk|reserved_lte_on_hand/);
  });

  it("inventory_movements es inmutable: UPDATE y DELETE fallan", async () => {
    await expect(db.$executeRaw`UPDATE inventory_movements SET quantity = 99`).rejects.toThrow(/inmutable/);
    await expect(db.$executeRaw`DELETE FROM inventory_movements`).rejects.toThrow(/inmutable/);
  });
});
