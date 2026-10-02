import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  adjustStock,
  consumeReservations,
  receiveStock,
  releaseReservations,
  reserve,
  sell,
} from "@/modules/inventory";
import { countMovements, expectAppError, expectInvariants, newKey, resetDemo, stockOf, tx, type Fixtures } from "./helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

describe("seed vía InventoryService", () => {
  it("carga inicial con movimientos CARGA_INICIAL, filas para todas las ubicaciones y ledger cuadrado", async () => {
    const variants = await db.productVariant.count();
    expect(await db.stockLevel.count()).toBe(variants * (await db.location.count()));
    const v = await f.variant("JMT012-AZU-48");
    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 0 });
    const m = await db.inventoryMovement.findMany({ where: { variantId: v } });
    expect(m.map((x) => x.type)).toEqual(["CARGA_INICIAL", "CARGA_INICIAL"]); // Rancagua y Bodega
    expect(m.every((x) => x.idempotencyKey?.startsWith("seed-carga-inicial-"))).toBe(true);
    // Sin stock (0) no hay movimiento, pero sí fila
    const sinStock = await f.variant("JMT012-NEG-48");
    expect(await countMovements({ variantId: sinStock, locationId: f.loc.TIENDA_RANCAGUA })).toBe(0);
    expect(await stockOf(sinStock, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 0, reserved: 0 });
    await expectInvariants();
  });
});

describe("sell", () => {
  it("venta OK: baja on_hand y registra VENTA_POS con saldo, usuario, documento y clave {key}:{n}", async () => {
    const v = await f.variant("PBA041-NEG-XL"); // Rancagua: 5
    const key = newKey("venta");
    const { movements } = await tx((t) =>
      sell(t, { actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, lines: [{ variantId: v, qty: 2 }], saleId: "sale-1", idempotencyKey: key }),
    );
    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 3, reserved: 0 });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      type: "VENTA_POS",
      quantity: -2,
      onHandAfter: 3,
      refType: "SALE",
      refId: "sale-1",
      idempotencyKey: `${key}:0`,
    });
    const stored = await db.inventoryMovement.findUniqueOrThrow({ where: { id: movements[0].id } });
    expect(stored.userId).toBe(f.actors.vendRga.id);
    await expectInvariants();
  });

  it("multi-línea: agrupa variantes repetidas y numera las claves en orden de variant_id", async () => {
    const a = await f.variant("PBA041-NEG-XL");
    const b = await f.variant("VNE033-NEG-52"); // Rancagua: 1
    const key = newKey("venta");
    const { movements } = await tx((t) =>
      sell(t, {
        actor: f.actors.vendRga,
        locationId: f.loc.TIENDA_RANCAGUA,
        lines: [
          { variantId: a, qty: 1 },
          { variantId: b, qty: 1 },
          { variantId: a, qty: 1 },
        ],
        saleId: "sale-2",
        idempotencyKey: key,
      }),
    );
    const sorted = [a, b].sort();
    expect(movements.map((m) => m.variantId)).toEqual(sorted);
    expect(movements.map((m) => m.idempotencyKey)).toEqual([`${key}:0`, `${key}:1`]);
    expect(movements.find((m) => m.variantId === a)!.quantity).toBe(-2);
    await expectInvariants();
  });

  it("stock insuficiente: STOCK_INSUFICIENTE claro, sin cambios ni movimientos", async () => {
    const v = await f.variant("JMT012-AZU-48"); // Rancagua: 1
    const err = await expectAppError(
      tx((t) =>
        sell(t, { actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, lines: [{ variantId: v, qty: 2 }], saleId: "s", idempotencyKey: newKey() }),
      ),
      "STOCK_INSUFICIENTE",
      /JMT012-AZU-48 en Tienda Rancagua: disponible 1, solicitado 2/,
    );
    expect(err.details).toMatchObject({ available: 1, requested: 2 });
    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 0 });
    expect(await countMovements({ variantId: v, type: "VENTA_POS" })).toBe(0);
  });

  it("si una línea no alcanza se revierte TODA la venta (también las líneas que sí alcanzaban)", async () => {
    const ok = await f.variant("PBA041-NEG-XL"); // 5
    const sinStock = await f.variant("JMT012-NEG-48"); // 0
    await expectAppError(
      tx((t) =>
        sell(t, {
          actor: f.actors.vendRga,
          locationId: f.loc.TIENDA_RANCAGUA,
          lines: [{ variantId: ok, qty: 1 }, { variantId: sinStock, qty: 1 }],
          saleId: "s",
          idempotencyKey: newKey(),
        }),
      ),
      "STOCK_INSUFICIENTE",
    );
    expect(await stockOf(ok, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 5, reserved: 0 });
    expect(await countMovements({ type: "VENTA_POS" })).toBe(0);
    await expectInvariants();
  });

  it("no se vende en BODEGA (no tiene POS)", async () => {
    const v = await f.variant("PBA041-NEG-XL");
    await expectAppError(
      tx((t) => sell(t, { actor: f.actors.belen, locationId: f.loc.BODEGA, lines: [{ variantId: v, qty: 1 }], saleId: "s", idempotencyKey: newKey() })),
      "VALIDATION",
    );
  });
});

describe("reservas", () => {
  it("una reserva bloquea la venta de la unidad reservada; al liberarla se puede vender", async () => {
    const v = await f.variant("JMT012-AZU-48"); // Rancagua: 1
    const [r] = await tx((t) =>
      reserve(t, { actor: f.actors.belen, lines: [{ variantId: v, locationId: f.loc.TIENDA_RANCAGUA, qty: 1 }] }),
    );
    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 1 });

    await expectAppError(
      tx((t) => sell(t, { actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, lines: [{ variantId: v, qty: 1 }], saleId: "s", idempotencyKey: newKey() })),
      "STOCK_INSUFICIENTE",
      /disponible 0 \(1 reservada para pedidos\)/,
    );
    await expectInvariants();

    await tx((t) => releaseReservations(t, { actor: f.actors.belen, reservationIds: [r.id], reason: "Clienta desistió" }));
    expect(await db.reservation.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "LIBERADA", releasedReason: "Clienta desistió" });
    await tx((t) => sell(t, { actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, lines: [{ variantId: v, qty: 1 }], saleId: "s", idempotencyKey: newKey() }));
    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 0, reserved: 0 });
    await expectInvariants();
  });

  it("no se puede reservar más que el disponible", async () => {
    const v = await f.variant("VNE033-NEG-52"); // Bodega: 2
    await tx((t) => reserve(t, { actor: f.actors.belen, lines: [{ variantId: v, locationId: f.loc.BODEGA, qty: 2 }] }));
    await expectAppError(
      tx((t) => reserve(t, { actor: f.actors.belen, lines: [{ variantId: v, locationId: f.loc.BODEGA, qty: 1 }] })),
      "STOCK_INSUFICIENTE",
    );
    await expectInvariants();
  });

  it("consumir en bodega: VENTA_ONLINE baja físico y reservado; consumir dos veces → CONFLICT", async () => {
    const v = await f.variant("PBA041-NEG-XL"); // Bodega: 20
    const [r1, r2] = await tx((t) =>
      reserve(t, {
        actor: f.actors.belen,
        lines: [
          { variantId: v, locationId: f.loc.BODEGA, qty: 2 },
          { variantId: v, locationId: f.loc.BODEGA, qty: 1 },
        ],
      }),
    );
    expect(await stockOf(v, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 3 });

    const key = newKey("picking");
    const { movements } = await tx((t) =>
      consumeReservations(t, { actor: f.actors.bodega, reservationIds: [r2.id, r1.id], onlineOrderId: "order-1", idempotencyKey: key }),
    );
    // Dos reservas de la misma variante → un solo movimiento agregado
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: "VENTA_ONLINE", quantity: -3, onHandAfter: 17, refType: "ONLINE_ORDER", idempotencyKey: `${key}:0` });
    expect(await stockOf(v, f.loc.BODEGA)).toEqual({ onHand: 17, reserved: 0 });

    await expectAppError(
      tx((t) => consumeReservations(t, { actor: f.actors.bodega, reservationIds: [r1.id], idempotencyKey: newKey() })),
      "CONFLICT",
    );
    await expectInvariants();
  });

  it("consumir solo en bodega: una reserva de tienda no se puede preparar", async () => {
    const v = await f.variant("CPU053-NEG-2XL"); // Rancagua: 3
    const [r] = await tx((t) => reserve(t, { actor: f.actors.belen, lines: [{ variantId: v, locationId: f.loc.TIENDA_RANCAGUA, qty: 1 }] }));
    await expectAppError(
      tx((t) => consumeReservations(t, { actor: f.actors.belen, reservationIds: [r.id], idempotencyKey: newKey() })),
      "VALIDATION",
      /solo se preparan en bodega/,
    );
  });
});

describe("receive / adjust", () => {
  it("receive suma stock con UPSERT (crea la fila si no existía)", async () => {
    const v = await f.variant("BLM022-BUR-3XL");
    await db.$executeRaw`DELETE FROM stock_levels WHERE variant_id = ${v} AND location_id = ${f.loc.TIENDA_RANCAGUA}`; // fila inexistente (sin movimientos)
    const { result } = await receiveStock({
      actor: f.actors.vendRga,
      locationId: f.loc.TIENDA_RANCAGUA,
      lines: [{ variantId: v, qty: 4 }],
      reason: "Factura 123",
      idempotencyKey: newKey("recepcion"),
    });
    expect(result.movements[0]).toMatchObject({ type: "RECEPCION", quantity: 4, onHandAfter: 4 });
    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 4, reserved: 0 });
    await expectInvariants();
  });

  it("ajuste positivo y negativo con motivo; queda en audit_log", async () => {
    const v = await f.variant("PBA041-NEG-XL"); // Rancagua: 5
    await adjustStock({ actor: f.actors.belen, locationId: f.loc.TIENDA_RANCAGUA, variantId: v, delta: 2, reason: "Conteo", idempotencyKey: newKey() });
    const { result } = await adjustStock({
      actor: f.actors.belen,
      locationId: f.loc.TIENDA_RANCAGUA,
      variantId: v,
      delta: -3,
      reason: "Prenda dañada",
      idempotencyKey: newKey(),
    });
    expect(result.movements[0]).toMatchObject({ type: "AJUSTE", quantity: -3, onHandAfter: 4 });
    expect(await db.auditLog.count({ where: { action: "STOCK_ADJUST" } })).toBe(2);
    await expectInvariants();
  });

  it("ajuste negativo valida contra DISPONIBLE: no descuenta unidades reservadas", async () => {
    const v = await f.variant("VNE033-NEG-52"); // Bodega: 2
    await tx((t) => reserve(t, { actor: f.actors.belen, lines: [{ variantId: v, locationId: f.loc.BODEGA, qty: 1 }] }));
    await expectAppError(
      adjustStock({ actor: f.actors.belen, locationId: f.loc.BODEGA, variantId: v, delta: -2, reason: "Pérdida", idempotencyKey: newKey() }),
      "STOCK_INSUFICIENTE",
      /disponible 1 \(1 reservada para pedidos\), solicitado 2/,
    );
    expect(await stockOf(v, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 1 });
    await expectInvariants();
  });

  it("ajuste sin motivo o en 0 → VALIDATION", async () => {
    const v = await f.variant("VNE033-NEG-52");
    await expectAppError(
      adjustStock({ actor: f.actors.belen, locationId: f.loc.BODEGA, variantId: v, delta: -1, reason: " ", idempotencyKey: newKey() }),
      "VALIDATION",
      /motivo/,
    );
    await expectAppError(
      adjustStock({ actor: f.actors.belen, locationId: f.loc.BODEGA, variantId: v, delta: 0, reason: "x y z", idempotencyKey: newKey() }),
      "VALIDATION",
    );
  });
});
