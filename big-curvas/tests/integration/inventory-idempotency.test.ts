import { beforeEach, describe, expect, it } from "vitest";
import { runIdempotent } from "@/lib/idempotency";
import {
  adjustStock,
  createTransferCommand,
  findOperationMovements,
  sell,
  sendTransferCommand,
  type StockOperationResult,
} from "@/modules/inventory";
import { countMovements, expectInvariants, newKey, resetDemo, stockOf, tx, type Fixtures } from "./helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

/**
 * Así hará sales la venta idempotente (Etapa 3): buscar por clave → transacción → si falla, releer FUERA de ella.
 */
function idempotentSale(fx: Fixtures, key: string, lines: { variantId: string; qty: number }[]) {
  return runIdempotent<StockOperationResult>({
    find: async () => {
      const movements = await findOperationMovements(key);
      return movements ? { movements } : null;
    },
    execute: () => tx((t) => sell(t, { actor: fx.actors.vendRga, locationId: fx.loc.TIENDA_RANCAGUA, lines, saleId: `sale-${key}`, idempotencyKey: key })),
  });
}

describe("idempotencia", () => {
  it("reintento secuencial con la misma clave: devuelve lo guardado y no descuenta dos veces", async () => {
    const v = await f.variant("PBA041-NEG-XL"); // Rancagua 5
    const key = newKey("venta");
    const first = await idempotentSale(f, key, [{ variantId: v, qty: 1 }]);
    const second = await idempotentSale(f, key, [{ variantId: v, qty: 1 }]);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result.movements.map((m) => m.id)).toEqual(first.result.movements.map((m) => m.id));
    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toMatchObject({ onHand: 4 });
  });

  it("misma clave enviada 2 veces EN PARALELO (venta multi-línea): una sola venta y un solo set de movimientos", async () => {
    const a = await f.variant("PBA041-NEG-XL"); // Rancagua 5
    const b = await f.variant("CPU053-NEG-2XL"); // Rancagua 3
    const key = newKey("venta");
    const lines = [{ variantId: a, qty: 1 }, { variantId: b, qty: 1 }];

    const results = await Promise.all([idempotentSale(f, key, lines), idempotentSale(f, key, lines)]);

    expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
    expect(results[0].result.movements.map((m) => m.id)).toEqual(results[1].result.movements.map((m) => m.id));
    expect(await countMovements({ keyPrefix: `${key}:` })).toBe(2);
    expect(await stockOf(a, f.loc.TIENDA_RANCAGUA)).toMatchObject({ onHand: 4 });
    expect(await stockOf(b, f.loc.TIENDA_RANCAGUA)).toMatchObject({ onHand: 2 });
    await expectInvariants();
  });

  it("misma clave en paralelo sobre la ÚLTIMA unidad: el duplicado no se reporta como 'sin stock'", async () => {
    const v = await f.variant("JMT012-AZU-48"); // Rancagua 1
    const key = newKey("venta");
    const results = await Promise.all([idempotentSale(f, key, [{ variantId: v, qty: 1 }]), idempotentSale(f, key, [{ variantId: v, qty: 1 }])]);
    expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
    expect(await countMovements({ keyPrefix: `${key}:` })).toBe(1);
    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 0, reserved: 0 });
    await expectInvariants();
  });

  it("comando de UI (ajuste) con la misma clave en paralelo: un solo movimiento y una sola auditoría", async () => {
    const v = await f.variant("PBA041-NEG-XL");
    const input = { actor: f.actors.belen, locationId: f.loc.BODEGA, variantId: v, delta: -1, reason: "Merma", idempotencyKey: newKey("ajuste") };
    const results = await Promise.all([adjustStock(input), adjustStock(input), adjustStock(input)]);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await countMovements({ keyPrefix: `${input.idempotencyKey}:` })).toBe(1);
    expect(await stockOf(v, f.loc.BODEGA)).toMatchObject({ onHand: 19 });
    await expectInvariants();
  });

  it("crear y enviar traspaso con la misma clave en paralelo: un traspaso, un envío", async () => {
    const v = await f.variant("BLM022-BUR-3XL"); // Bodega 5
    const createInput = {
      actor: f.actors.bodega,
      fromLocationId: f.loc.BODEGA,
      toLocationId: f.loc.TIENDA_RANCAGUA,
      lines: [{ variantId: v, qty: 2 }],
      idempotencyKey: newKey("crear"),
    };
    const created = await Promise.all([createTransferCommand(createInput), createTransferCommand(createInput)]);
    expect(created[0].result.id).toBe(created[1].result.id);

    const sendInput = { actor: f.actors.bodega, transferId: created[0].result.id, idempotencyKey: newKey("enviar") };
    const sent = await Promise.all([sendTransferCommand(sendInput), sendTransferCommand(sendInput)]);
    expect(sent.map((r) => r.replayed).sort()).toEqual([false, true]);
    expect(await countMovements({ keyPrefix: `${sendInput.idempotencyKey}:` })).toBe(1);
    expect(await stockOf(v, f.loc.BODEGA)).toMatchObject({ onHand: 3 });
    await expectInvariants();
  });
});
