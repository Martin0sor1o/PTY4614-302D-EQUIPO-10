import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { lockStock, reserve, returnToStock, writeOff } from "@/modules/inventory";
import { countMovements, createOrderLineFixture, expectAppError, expectInvariants, newKey, resetDemo, stockOf, tx, type Fixtures } from "./helpers";

// InventoryService para devoluciones (ADR-021): returnToStock (DEVOLUCION), writeOff (MERMA) y lockStock (bloqueo ordenado).

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const PBA_XL = "PBA041-NEG-XL"; // Rancagua 5 · Bodega 20
const JMT_NEG = "JMT012-NEG-48"; // Rancagua 0 · Bodega 6

const back = (v: string, qty: number, opts: { loc?: string; actor?: Fixtures["actors"]["belen"]; key?: string } = {}) =>
  tx((t) => returnToStock(t, { actor: opts.actor ?? f.actors.vendRga, locationId: opts.loc ?? f.loc.TIENDA_RANCAGUA, lines: [{ variantId: v, qty }], returnId: "ret-1", idempotencyKey: opts.key ?? newKey("dev") }));

const off = (v: string, qty: number, opts: { loc?: string; actor?: Fixtures["actors"]["belen"] } = {}) =>
  tx((t) =>
    writeOff(t, { actor: opts.actor ?? f.actors.vendRga, locationId: opts.loc ?? f.loc.TIENDA_RANCAGUA, lines: [{ variantId: v, qty }], returnId: "ret-1", reason: "Prenda dañada", idempotencyKey: newKey("merma") }),
  );

describe("returnToStock", () => {
  it("sube el stock de la ubicación y deja un movimiento DEVOLUCION inmutable ligado a la devolución", async () => {
    const v = await f.variant(PBA_XL);
    const { movements } = await back(v, 2);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: "DEVOLUCION", quantity: 2, onHandAfter: 7, refType: "RETURN", refId: "ret-1", locationId: f.loc.TIENDA_RANCAGUA });
    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 7, reserved: 0 });
    expect(await stockOf(v, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 0 }); // la otra ubicación no se toca
    await expect(db.$executeRaw`UPDATE inventory_movements SET quantity = 9 WHERE id = ${movements[0].id}`).rejects.toThrow(/inmutable/);
    await expectInvariants();
  });

  it("junta las líneas repetidas de una variante en un solo movimiento", async () => {
    const v = await f.variant(PBA_XL);
    const { movements } = await tx((t) =>
      returnToStock(t, { actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, lines: [{ variantId: v, qty: 1 }, { variantId: v, qty: 2 }], returnId: "r", idempotencyKey: newKey("dev") }),
    );
    expect(movements).toHaveLength(1);
    expect(movements[0].quantity).toBe(3);
  });

  it("crea la fila de stock si la variante nunca estuvo en esa ubicación", async () => {
    const v = await f.variant(JMT_NEG);
    await tx((t) => t.stockLevel.deleteMany({ where: { variantId: v, locationId: f.loc.TIENDA_RANCAGUA } }));
    expect((await back(v, 1)).movements[0].onHandAfter).toBe(1);
  });

  it("acceso: vendedora y bodega solo en su ubicación; Belén en cualquiera", async () => {
    const v = await f.variant(PBA_XL);
    await expectAppError(back(v, 1, { loc: f.loc.BODEGA }), "FORBIDDEN"); // vendedora de Rancagua en la bodega
    await expectAppError(back(v, 1, { actor: f.actors.bodega }), "FORBIDDEN"); // usuario de bodega en la tienda
    await back(v, 1, { loc: f.loc.BODEGA, actor: f.actors.bodega });
    await back(v, 1, { loc: f.loc.BODEGA, actor: f.actors.belen });
    expect((await stockOf(v, f.loc.BODEGA)).onHand).toBe(22);
    expect((await stockOf(v, f.loc.TIENDA_RANCAGUA)).onHand).toBe(5);
  });

  it("variante inexistente, ubicación inexistente y cantidades inválidas se rechazan", async () => {
    const v = await f.variant(PBA_XL);
    await expectAppError(back("no-existe", 1), "NOT_FOUND");
    await expectAppError(tx((t) => returnToStock(t, { actor: f.actors.belen, locationId: "no-existe", lines: [{ variantId: v, qty: 1 }], returnId: "r", idempotencyKey: newKey("d") })), "NOT_FOUND");
    await expectAppError(back(v, 0), "VALIDATION");
    await expectAppError(back(v, -1), "VALIDATION");
    await expectAppError(back(v, 1.5), "VALIDATION");
  });

  it("la misma clave de movimiento no se aplica dos veces (única en la BD)", async () => {
    const v = await f.variant(PBA_XL);
    const key = newKey("dev");
    await back(v, 1, { key });
    await expect(back(v, 1, { key })).rejects.toThrow();
    expect((await stockOf(v, f.loc.TIENDA_RANCAGUA)).onHand).toBe(6);
    expect(await countMovements({ keyPrefix: key })).toBe(1);
  });
});

describe("writeOff", () => {
  it("baja el stock con un movimiento MERMA negativo ligado a la devolución", async () => {
    const v = await f.variant(PBA_XL);
    const { movements } = await off(v, 2);
    expect(movements[0]).toMatchObject({ type: "MERMA", quantity: -2, onHandAfter: 3, refType: "RETURN", refId: "ret-1" });
    expect((await stockOf(v, f.loc.TIENDA_RANCAGUA)).onHand).toBe(3);
    await expectInvariants();
  });

  it("devolución + merma de la misma unidad deja el stock igual", async () => {
    const v = await f.variant(PBA_XL);
    await tx(async (t) => {
      await returnToStock(t, { actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, lines: [{ variantId: v, qty: 1 }], returnId: "r", idempotencyKey: newKey("dev") });
      await writeOff(t, { actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, lines: [{ variantId: v, qty: 1 }], returnId: "r", reason: "Prenda dañada", idempotencyKey: newKey("merma") });
    });
    expect((await stockOf(v, f.loc.TIENDA_RANCAGUA)).onHand).toBe(5);
    expect(await db.inventoryMovement.count({ where: { variantId: v, refType: "RETURN" } })).toBe(2);
    await expectInvariants();
  });

  it("no descuenta más de lo disponible ni toca lo reservado para pedidos", async () => {
    const v = await f.variant(PBA_XL);
    await expectAppError(off(v, 6), "STOCK_INSUFICIENTE");
    const { orderLineId } = await createOrderLineFixture(f, v, f.loc.TIENDA_RANCAGUA, 4);
    await tx((t) => reserve(t, { actor: f.actors.belen, lines: [{ variantId: v, locationId: f.loc.TIENDA_RANCAGUA, qty: 4, orderLineId }] }));
    await expectAppError(off(v, 2), "STOCK_INSUFICIENTE", /reservada/); // disponible 1, reservadas 4
    await off(v, 1);
    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 4, reserved: 4 });
    await expectInvariants();
  });

  it("acceso por ubicación y motivo obligatorio", async () => {
    const v = await f.variant(PBA_XL);
    await expectAppError(off(v, 1, { loc: f.loc.BODEGA }), "FORBIDDEN");
    await expectAppError(
      tx((t) => writeOff(t, { actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, lines: [{ variantId: v, qty: 1 }], returnId: "r", reason: "", idempotencyKey: newKey("m") })),
      "VALIDATION",
    );
  });
});

describe("lockStock (bloqueo ordenado, dentro de InventoryService)", () => {
  it("crea con 0 las filas que no existen y no cambia cantidades ni deja movimientos", async () => {
    const v = await f.variant(JMT_NEG);
    await tx((t) => t.stockLevel.deleteMany({ where: { variantId: v, locationId: f.loc.TIENDA_RANCAGUA } }));
    const movementsBefore = await db.inventoryMovement.count();
    await tx((t) => lockStock(t, { actor: f.actors.vendRga, keys: [{ locationId: f.loc.TIENDA_RANCAGUA, variantId: v }] }));
    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 0, reserved: 0 });
    expect(await db.inventoryMovement.count()).toBe(movementsBefore);
  });

  it("exige acceso a cada ubicación tocada", async () => {
    const v = await f.variant(PBA_XL);
    await expectAppError(tx((t) => lockStock(t, { actor: f.actors.vendRga, keys: [{ locationId: f.loc.TIENDA_RANCAGUA, variantId: v }, { locationId: f.loc.BODEGA, variantId: v }] })), "FORBIDDEN");
    await tx((t) => lockStock(t, { actor: f.actors.belen, keys: [{ locationId: f.loc.TIENDA_RANCAGUA, variantId: v }, { locationId: f.loc.BODEGA, variantId: v }] }));
  });

  it("dos transacciones que tocan las mismas filas en orden inverso no se bloquean entre sí (10 rondas)", async () => {
    const x = await f.variant(PBA_XL);
    const y = await f.variant("PBA041-NEG-2XL");
    const loc = f.loc.TIENDA_RANCAGUA;
    const touch = (first: string, second: string, keys: { locationId: string; variantId: string }[]) =>
      tx(async (t) => {
        await lockStock(t, { actor: f.actors.vendRga, keys });
        await returnToStock(t, { actor: f.actors.vendRga, locationId: loc, lines: [{ variantId: first, qty: 1 }], returnId: "r", idempotencyKey: newKey("a") });
        await returnToStock(t, { actor: f.actors.vendRga, locationId: loc, lines: [{ variantId: second, qty: 1 }], returnId: "r", idempotencyKey: newKey("b") });
      });
    for (let i = 0; i < 10; i++) {
      const results = await Promise.allSettled([
        touch(x, y, [{ locationId: loc, variantId: x }, { locationId: loc, variantId: y }]),
        touch(y, x, [{ locationId: loc, variantId: y }, { locationId: loc, variantId: x }]),
      ]);
      for (const r of results) expect(r.status === "rejected" ? String((r.reason as Error).message) : "ok").toBe("ok");
    }
    expect((await stockOf(x, loc)).onHand).toBe(5 + 20);
    await expectInvariants();
  });
});
