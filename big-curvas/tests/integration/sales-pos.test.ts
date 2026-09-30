import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { reserve } from "@/modules/inventory";
import {
  closeCashSession,
  createSale,
  getCashClosingTotals,
  getSaleForActor,
  listSalesOfDay,
  openCashSession,
  priceLine,
  searchPosItems,
  type CreateSaleInput,
} from "@/modules/sales";
import { countMovements, createOrderLineFixture, expectAppError, expectInvariants, newKey, resetDemo, stockOf, tx, type Fixtures } from "./helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const AZU_48 = "JMT012-AZU-48"; // $29.990 · Rancagua: 1 · Providencia: 3 · Bodega: 8
const NEG_48 = "JMT012-NEG-48"; // Rancagua: 0 · Providencia: 4 · Bodega: 6
const PBA_XL = "PBA041-NEG-XL"; // Rancagua: 5

const cash = (cashReceived: number) => ({ method: "EFECTIVO" as const, cashReceived });
const card = (reference = "V-1001") => ({ method: "DEBITO" as const, reference });

async function openRga(openingCash = 50_000) {
  return openCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, openingCash });
}
async function openPro(openingCash = 30_000) {
  return openCashSession({ actor: f.actors.vendPro, locationId: f.loc.TIENDA_PROVIDENCIA, openingCash });
}

async function saleRga(
  lines: { sku: string; qty?: number; discountBps?: number }[],
  payment: CreateSaleInput["payment"] = card(),
  key = newKey("venta"),
) {
  return createSale({
    actor: f.actors.vendRga,
    locationId: f.loc.TIENDA_RANCAGUA,
    lines: await Promise.all(lines.map(async (l) => ({ variantId: await f.variant(l.sku), qty: l.qty ?? 1, discountBps: l.discountBps ?? 0 }))),
    payment,
    idempotencyKey: key,
  });
}

/** Descuento (bps) con el que el total de una unidad de `price` termina en el dígito pedido. */
function bpsForEnding(price: number, digit: number): number {
  for (let bps = 0; bps <= 1000; bps++) {
    if (priceLine({ unitPrice: price, quantity: 1, discountBps: bps }).lineTotal % 10 === digit) return bps;
  }
  throw new Error(`no hay descuento ≤ 10 % que deje el total terminando en ${digit}`);
}

describe("venta OK", () => {
  it("baja el stock, genera VENTA_POS, guarda venta/líneas/pago y numera RGA-000001", async () => {
    await openRga();
    const v = await f.variant(AZU_48);
    const { result: sale, replayed } = await saleRga([{ sku: AZU_48 }], card("V-777"));

    expect(replayed).toBe(false);
    expect(sale.number).toBe("RGA-000001");
    expect(sale).toMatchObject({ subtotal: 29_990, discountTotal: 0, total: 29_990, roundingAdjustment: 0 });
    expect(sale.lines).toHaveLength(1);
    expect(sale.payments).toEqual([{ method: "DEBITO", amount: 29_990, reference: "V-777", cashReceived: null, change: null }]);

    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 0, reserved: 0 });
    const movements = await db.inventoryMovement.findMany({ where: { variantId: v, type: "VENTA_POS" } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ quantity: -1, refType: "SALE", refId: sale.id, locationId: f.loc.TIENDA_RANCAGUA, userId: f.actors.vendRga.id });
    await expectInvariants();
  });

  it("precio efectivo: usa price_override si existe", async () => {
    await openRga();
    const v = await f.variant(PBA_XL);
    await db.productVariant.update({ where: { id: v }, data: { priceOverride: 1_990 } });
    const { result } = await saleRga([{ sku: PBA_XL, qty: 2 }]);
    expect(result.lines[0]).toMatchObject({ unitPrice: 1_990, quantity: 2, lineTotal: 3_980 });
  });

  it("el correlativo es por tienda: PRO-000001 aunque Rancagua ya vendió", async () => {
    await openRga();
    await openPro();
    await saleRga([{ sku: PBA_XL }]);
    const { result: pro } = await createSale({
      actor: f.actors.vendPro,
      locationId: f.loc.TIENDA_PROVIDENCIA,
      lines: [{ variantId: await f.variant(PBA_XL), qty: 1, discountBps: 0 }],
      payment: card(),
      idempotencyKey: newKey(),
    });
    expect(pro.number).toBe("PRO-000001");
    const { result: rga2 } = await saleRga([{ sku: PBA_XL }]);
    expect(rga2.number).toBe("RGA-000002");
  });

  it("el cliente no manda montos: un total falso enviado se ignora y manda el del servidor", async () => {
    await openRga();
    const forged = {
      actor: f.actors.vendRga,
      locationId: f.loc.TIENDA_RANCAGUA,
      lines: [{ variantId: await f.variant(AZU_48), qty: 1, discountBps: 0, unitPrice: 1, lineTotal: 1 }],
      payment: { method: "DEBITO", reference: "V-1", amount: 1 },
      total: 1,
      idempotencyKey: newKey(),
    } as unknown as CreateSaleInput;
    const { result } = await createSale(forged);
    expect(result.total).toBe(29_990);
    expect(result.payments[0].amount).toBe(29_990);
  });
});

describe("stock insuficiente", () => {
  it("revierte TODO y nombra la prenda que falló (2ª línea sin stock)", async () => {
    await openRga();
    const ok = await f.variant(PBA_XL);
    const bad = await f.variant(NEG_48);
    const movementsBefore = await countMovements({ type: "VENTA_POS" });

    const error = await expectAppError(saleRga([{ sku: PBA_XL }, { sku: NEG_48 }]), "STOCK_INSUFICIENTE", new RegExp(NEG_48));
    expect(error.details).toMatchObject({ variantId: bad, sku: NEG_48 });

    expect(await stockOf(ok, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 5, reserved: 0 });
    expect(await stockOf(bad, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 0, reserved: 0 });
    expect(await countMovements({ type: "VENTA_POS" })).toBe(movementsBefore);
    expect(await db.sale.count()).toBe(0);
    expect(await db.payment.count()).toBe(0);
    await expectInvariants();

    // El correlativo no se consumió: la siguiente venta sigue siendo la 000001.
    const { result } = await saleRga([{ sku: PBA_XL }]);
    expect(result.number).toBe("RGA-000001");
  });

  it("una unidad reservada no se puede vender", async () => {
    await openRga();
    const v = await f.variant(AZU_48);
    const { orderLineId } = await createOrderLineFixture(f, v, f.loc.TIENDA_RANCAGUA);
    await tx((t) => reserve(t, { actor: f.actors.belen, lines: [{ variantId: v, locationId: f.loc.TIENDA_RANCAGUA, qty: 1, orderLineId }] }));
    await expectAppError(saleRga([{ sku: AZU_48 }]), "STOCK_INSUFICIENTE", /reservada/);
  });
});

describe("idempotencia", () => {
  it("doble clic (misma clave, secuencial): una sola venta y el mismo resultado", async () => {
    await openRga();
    const key = newKey("dobleclic");
    const first = await saleRga([{ sku: AZU_48 }], cash(30_000), key);
    const second = await saleRga([{ sku: AZU_48 }], cash(30_000), key);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result.id).toBe(first.result.id);
    expect(await db.sale.count()).toBe(1);
    expect(await countMovements({ type: "VENTA_POS", variantId: await f.variant(AZU_48) })).toBe(1);
    expect(await stockOf(await f.variant(AZU_48), f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 0, reserved: 0 });
    await expectInvariants();
  });

  it("6 envíos simultáneos con la misma clave: una sola venta, todos reciben la misma", async () => {
    await openRga();
    const key = newKey("simultaneo");
    const results = await Promise.all(Array.from({ length: 6 }, () => saleRga([{ sku: PBA_XL, qty: 2 }], card(), key)));
    expect(new Set(results.map((r) => r.result.id)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await db.sale.count()).toBe(1);
    expect(await stockOf(await f.variant(PBA_XL), f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 3, reserved: 0 });
    await expectInvariants();
  });
});

describe("concurrencia: dos ventas de la última unidad", () => {
  it("con claves distintas, una gana y la otra recibe STOCK_INSUFICIENTE (sin huecos en el correlativo)", async () => {
    await openRga();
    const results = await Promise.allSettled([saleRga([{ sku: AZU_48 }]), saleRga([{ sku: AZU_48 }])]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0].reason as AppError).code).toBe("STOCK_INSUFICIENTE");
    expect(await db.sale.count()).toBe(1);
    expect(await stockOf(await f.variant(AZU_48), f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 0, reserved: 0 });
    await expectInvariants();
  });
});

describe("redondeo de efectivo a $10 (RN-19)", () => {
  it.each([1, 2, 3, 4, 5])("total que termina en %i baja a la decena inferior", async (digit) => {
    await openRga();
    const bps = bpsForEnding(await priceOf(PBA_XL), digit);
    const { result } = await saleRga([{ sku: PBA_XL, discountBps: bps }], cash(100_000));
    expect(result.total % 10).toBe(digit);
    expect(result.roundingAdjustment).toBe(-digit);
    expect(result.payments[0].amount).toBe(result.total - digit);
    expect(result.payments[0].amount % 10).toBe(0);
  });

  it.each([6, 7, 8, 9])("total que termina en %i sube a la decena superior", async (digit) => {
    await openRga();
    const price = await priceOf(PBA_XL);
    const bps = bpsForEnding(price, digit);
    const { result } = await saleRga([{ sku: PBA_XL, discountBps: bps }], cash(100_000));
    expect(result.total % 10).toBe(digit);
    expect(result.roundingAdjustment).toBe(10 - digit);
    expect(result.payments[0].amount).toBe(result.total + result.roundingAdjustment);
    expect(result.payments[0].amount % 10).toBe(0);
  });

  it("invariante: SUM(payments) = total + rounding_adjustment; vuelto = recibido − cobrado", async () => {
    await openRga();
    const bps = bpsForEnding(await priceOf(PBA_XL), 8);
    const { result } = await saleRga([{ sku: PBA_XL, discountBps: bps }], cash(50_000));
    const sum = result.payments.reduce((a, p) => a + p.amount, 0);
    expect(sum).toBe(result.total + result.roundingAdjustment);
    expect(result.payments[0].change).toBe(50_000 - sum);
  });

  it("tarjeta y transferencia no se redondean", async () => {
    await openRga();
    const bps = bpsForEnding(await priceOf(PBA_XL), 8);
    const { result } = await saleRga([{ sku: PBA_XL, discountBps: bps }], card());
    expect(result.roundingAdjustment).toBe(0);
    expect(result.payments[0].amount).toBe(result.total);
  });
});

async function priceOf(sku: string): Promise<number> {
  const v = await db.productVariant.findUniqueOrThrow({ where: { sku }, include: { product: true } });
  return v.priceOverride ?? v.product.basePrice;
}

describe("validación de pago", () => {
  it("efectivo recibido menor al total → rechazado y sin efectos", async () => {
    await openRga();
    await expectAppError(saleRga([{ sku: AZU_48 }], cash(29_980)), "VALIDATION", /menor al total/);
    expect(await db.sale.count()).toBe(0);
    expect(await stockOf(await f.variant(AZU_48), f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 0 });
  });
  it("débito/crédito sin N° de voucher y transferencia sin referencia → rechazados", async () => {
    await openRga();
    await expectAppError(saleRga([{ sku: AZU_48 }], { method: "DEBITO", reference: "  " }), "VALIDATION", /voucher/);
    await expectAppError(saleRga([{ sku: AZU_48 }], { method: "CREDITO", reference: "" }), "VALIDATION", /voucher/);
    await expectAppError(saleRga([{ sku: AZU_48 }], { method: "TRANSFERENCIA", reference: "" }), "VALIDATION", /referencia/);
    expect(await db.sale.count()).toBe(0);
  });
  it("transferencia con referencia se guarda", async () => {
    await openRga();
    const { result } = await saleRga([{ sku: AZU_48 }], { method: "TRANSFERENCIA", reference: "TR-42" });
    expect(result.payments[0]).toMatchObject({ method: "TRANSFERENCIA", reference: "TR-42", amount: 29_990 });
  });
});

describe("descuento sobre el límite (settings: 10 %)", () => {
  it("10,01 % se rechaza en el servidor con 'Requiere aprobación de Belén' y no toca el stock", async () => {
    await openRga();
    const error = await expectAppError(saleRga([{ sku: AZU_48, discountBps: 1001 }]), "APROBACION_REQUERIDA", /^Requiere aprobación de Belén/);
    expect(error.details).toMatchObject({ discountBps: 1001, limitBps: 1000 });
    expect(await db.sale.count()).toBe(0);
    expect(await stockOf(await f.variant(AZU_48), f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 0 });
  });
  it("exactamente el 10 % pasa", async () => {
    await openRga();
    const { result } = await saleRga([{ sku: AZU_48, discountBps: 1000 }]);
    expect(result).toMatchObject({ discountTotal: 2_999, total: 26_991 });
    expect(result.lines[0]).toMatchObject({ discountBps: 1000, discount: 2_999, lineTotal: 26_991 });
  });
  it("el límite sale de settings (no está fijo en el código)", async () => {
    await openRga();
    await db.setting.update({ where: { key: "max_seller_discount_bps" }, data: { valueInt: 500 } });
    await expectAppError(saleRga([{ sku: AZU_48, discountBps: 1000 }]), "APROBACION_REQUERIDA");
    await saleRga([{ sku: AZU_48, discountBps: 500 }]);
  });
});

describe("acceso cruzado (regla 10)", () => {
  it("la vendedora de Providencia no puede vender en Rancagua", async () => {
    await openRga();
    await openPro();
    await expectAppError(
      createSale({
        actor: f.actors.vendPro,
        locationId: f.loc.TIENDA_RANCAGUA,
        lines: [{ variantId: await f.variant(AZU_48), qty: 1, discountBps: 0 }],
        payment: card(),
        idempotencyKey: newKey(),
      }),
      "FORBIDDEN",
    );
    expect(await db.sale.count()).toBe(0);
    expect(await stockOf(await f.variant(AZU_48), f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 0 });
  });

  it("no puede abrir ni cerrar la caja de otra tienda, ni leer sus ventas ni su ticket", async () => {
    await openRga();
    const { result: sale } = await saleRga([{ sku: PBA_XL }]);
    await expectAppError(openCashSession({ actor: f.actors.vendPro, locationId: f.loc.TIENDA_RANCAGUA, openingCash: 0 }), "FORBIDDEN");
    await expectAppError(closeCashSession({ actor: f.actors.vendPro, locationId: f.loc.TIENDA_RANCAGUA, countedCash: 0 }), "FORBIDDEN");
    await expectAppError(listSalesOfDay({ actor: f.actors.vendPro, locationId: f.loc.TIENDA_RANCAGUA }), "FORBIDDEN");
    await expectAppError(getSaleForActor(f.actors.vendPro, sale.id), "FORBIDDEN");
    await expectAppError(searchPosItems({ actor: f.actors.vendPro, locationId: f.loc.TIENDA_RANCAGUA, query: "JMT012" }), "FORBIDDEN");
    expect((await getSaleForActor(f.actors.vendRga, sale.id)).id).toBe(sale.id);
    expect((await getSaleForActor(f.actors.belen, sale.id)).id).toBe(sale.id);
  });

  it("BODEGA no tiene POS (RN-28): ni su usuario ni Belén pueden vender desde la bodega", async () => {
    const lines = [{ variantId: await f.variant("PBA041-NEG-XL"), qty: 1, discountBps: 0 }];
    await expectAppError(
      createSale({ actor: f.actors.bodega, locationId: f.loc.BODEGA, lines, payment: card(), idempotencyKey: newKey() }),
      "FORBIDDEN",
    );
    await expectAppError(openCashSession({ actor: f.actors.bodega, locationId: f.loc.BODEGA, openingCash: 0 }), "FORBIDDEN");
    await expectAppError(openCashSession({ actor: f.actors.belen, locationId: f.loc.BODEGA, openingCash: 0 }), "VALIDATION", /no vende en POS/);
  });

  it("Belén (ADMIN) sí puede vender en la tienda que elige", async () => {
    await openPro();
    const { result } = await createSale({
      actor: f.actors.belen,
      locationId: f.loc.TIENDA_PROVIDENCIA,
      lines: [{ variantId: await f.variant(PBA_XL), qty: 1, discountBps: 0 }],
      payment: card(),
      idempotencyKey: newKey(),
    });
    expect(result.number).toBe("PRO-000001");
    expect(result.sellerName).toBe("Belén");
  });
});

describe("caja", () => {
  it("no se puede vender sin caja abierta", async () => {
    await expectAppError(saleRga([{ sku: AZU_48 }]), "CONFLICT", /caja/i);
    expect(await db.sale.count()).toBe(0);
    expect(await stockOf(await f.variant(AZU_48), f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 0 });
  });

  it("la caja abierta en otra tienda no habilita la venta", async () => {
    await openPro();
    await expectAppError(saleRga([{ sku: AZU_48 }]), "CONFLICT", /caja/i);
  });

  it("tras cerrar la caja ya no se puede vender", async () => {
    await openRga();
    await closeCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, countedCash: 50_000 });
    await expectAppError(saleRga([{ sku: AZU_48 }]), "CONFLICT", /caja/i);
  });

  it("una sola caja abierta por tienda (también con aperturas simultáneas)", async () => {
    await openRga();
    await expectAppError(openRga(), "CONFLICT", /ya hay una caja abierta/i);
    await openPro(); // otra tienda: sí

    await closeCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, countedCash: 50_000 });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => openRga()));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((x): x is PromiseRejectedResult => x.status === "rejected")) {
      expect((r.reason as AppError).code).toBe("CONFLICT");
    }
    expect(await db.cashSession.count({ where: { locationId: f.loc.TIENDA_RANCAGUA, status: "ABIERTA" } })).toBe(1);
  });

  it("el índice único parcial lo exige la base de datos, no solo el código", async () => {
    await openRga();
    await expect(
      db.cashSession.create({ data: { locationId: f.loc.TIENDA_RANCAGUA, openedBy: f.actors.vendRga.id, openingCash: 1 } }),
    ).rejects.toThrow();
  });

  it("monto inicial inválido → rechazado", async () => {
    await expectAppError(openCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, openingCash: -1 }), "VALIDATION");
    await expectAppError(openCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, openingCash: 10.5 }), "VALIDATION");
  });
});

describe("cierre de caja", () => {
  async function scenario() {
    const session = await openRga(50_000);
    const bps6 = bpsForEnding(await priceOf(PBA_XL), 6); // efectivo: sube a la decena
    const bps3 = bpsForEnding(await priceOf(PBA_XL), 3); // efectivo: baja a la decena
    const a = await saleRga([{ sku: PBA_XL, discountBps: bps6 }], cash(100_000));
    const b = await saleRga([{ sku: PBA_XL, discountBps: bps3 }], cash(100_000));
    await saleRga([{ sku: AZU_48 }], card()); // tarjeta: no entra al efectivo esperado
    const cashCollected = a.result.payments[0].amount + b.result.payments[0].amount;
    return { session, cashCollected, a: a.result, b: b.result };
  }

  it("esperado = inicial + efectivo cobrado (neto de vueltos y con redondeo); tarjeta no cuenta", async () => {
    const { session, cashCollected, a, b } = await scenario();
    expect(a.roundingAdjustment).toBeGreaterThan(0);
    expect(b.roundingAdjustment).toBeLessThan(0);

    const totals = await getCashClosingTotals(f.actors.vendRga, session.id);
    expect(totals.salesCount).toBe(3);
    expect(totals.cashCollected).toBe(cashCollected);
    expect(totals.byMethod.DEBITO).toBe(29_990);
    expect(totals.expectedCash).toBe(50_000 + cashCollected);
  });

  it("contado exacto: diferencia 0 y no exige observación", async () => {
    const { session, cashCollected } = await scenario();
    const closed = await closeCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, countedCash: 50_000 + cashCollected });
    expect(closed).toMatchObject({ id: session.id, status: "CERRADA", expectedCash: 50_000 + cashCollected, difference: 0, notes: null });
    expect(closed.closedAt).toBeInstanceOf(Date);
    expect(await db.auditLog.count({ where: { action: "CASH_CLOSE_WITH_DIFFERENCE" } })).toBe(0);
  });

  it("con diferencia exige observación; si falta, no cierra y responde la diferencia", async () => {
    const { cashCollected } = await scenario();
    const counted = 50_000 + cashCollected - 1_500; // faltan $1.500
    const error = await expectAppError(
      closeCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, countedCash: counted }),
      "VALIDATION",
      /diferencia de -\$1\.500/,
    );
    expect(error.details).toMatchObject({ needsNotes: true, difference: -1_500 });
    expect(await db.cashSession.count({ where: { status: "ABIERTA" } })).toBe(1); // sigue abierta

    const closed = await closeCashSession({
      actor: f.actors.vendRga,
      locationId: f.loc.TIENDA_RANCAGUA,
      countedCash: counted,
      notes: "Vuelto mal dado en la mañana",
    });
    expect(closed).toMatchObject({ status: "CERRADA", difference: -1_500, countedCash: counted, notes: "Vuelto mal dado en la mañana" });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "CASH_CLOSE_WITH_DIFFERENCE" } });
    expect(audit).toMatchObject({ userId: f.actors.vendRga.id, entityId: closed.id });
  });

  it("sobrante también es diferencia (positiva) y exige observación", async () => {
    await openRga(10_000);
    await expectAppError(closeCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, countedCash: 10_300 }), "VALIDATION", /diferencia de \$300/);
    const closed = await closeCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, countedCash: 10_300, notes: "Sobra" });
    expect(closed.difference).toBe(300);
  });

  it("no se puede cerrar dos veces", async () => {
    await openRga();
    await closeCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, countedCash: 50_000 });
    await expectAppError(closeCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, countedCash: 50_000 }), "CONFLICT");
  });

  it("después de cerrar se puede abrir una caja nueva y sus ventas no se mezclan con la anterior", async () => {
    const { cashCollected } = await scenario();
    await closeCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, countedCash: 50_000 + cashCollected });
    const second = await openRga(20_000);
    const totals = await getCashClosingTotals(f.actors.vendRga, second.id);
    expect(totals).toMatchObject({ salesCount: 0, cashCollected: 0, expectedCash: 20_000 });
  });
});

describe("ventas del día y búsqueda", () => {
  it("lista las ventas de la tienda del día con el total por medio de pago", async () => {
    await openRga();
    await openPro();
    await saleRga([{ sku: PBA_XL }], card());
    await saleRga([{ sku: PBA_XL }], { method: "TRANSFERENCIA", reference: "T-1" });
    const cashSale = await saleRga([{ sku: AZU_48 }], cash(30_000));
    await createSale({
      actor: f.actors.vendPro,
      locationId: f.loc.TIENDA_PROVIDENCIA,
      lines: [{ variantId: await f.variant(PBA_XL), qty: 1, discountBps: 0 }],
      payment: card(),
      idempotencyKey: newKey(),
    });

    const day = await listSalesOfDay({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA });
    expect(day.count).toBe(3);
    const pba = await priceOf(PBA_XL);
    expect(day.totalsByMethod).toEqual({ EFECTIVO: cashSale.result.payments[0].amount, DEBITO: pba, CREDITO: 0, TRANSFERENCIA: pba });
    expect(day.totalCollected).toBe(cashSale.result.payments[0].amount + 2 * pba);
    expect(day.sales[0].number).toBe("RGA-000003"); // más reciente primero
  });

  it("las ventas de otro día (Chile) no entran en 'ventas del día'", async () => {
    await openRga();
    const { result } = await saleRga([{ sku: PBA_XL }]);
    await db.sale.update({ where: { id: result.id }, data: { createdAt: new Date(Date.now() - 3 * 24 * 3_600_000) } });
    const day = await listSalesOfDay({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA });
    expect(day.count).toBe(0);
  });

  it("sin stock en la tienda muestra dónde hay (solo consulta) — JMT012-NEG-48", async () => {
    const [item] = await searchPosItems({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, query: NEG_48 });
    expect(item.sku).toBe(NEG_48);
    expect(item.here).toEqual({ onHand: 0, reserved: 0, available: 0 });
    expect(item.others.map((o) => [o.name, o.available])).toEqual(
      expect.arrayContaining([
        ["Tienda Providencia", 4],
        ["Bodega", 6],
      ]),
    );
  });

  it("indica las unidades reservadas de la tienda", async () => {
    const v = await f.variant(PBA_XL);
    const { orderLineId } = await createOrderLineFixture(f, v, f.loc.TIENDA_RANCAGUA, 2);
    await tx((t) => reserve(t, { actor: f.actors.belen, lines: [{ variantId: v, locationId: f.loc.TIENDA_RANCAGUA, qty: 2, orderLineId }] }));
    const [item] = await searchPosItems({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, query: PBA_XL });
    expect(item.here).toEqual({ onHand: 5, reserved: 2, available: 3 });
  });

  it("el código de barras exacto va primero; varias palabras se combinan (AND)", async () => {
    const variant = await db.productVariant.findUniqueOrThrow({ where: { sku: AZU_48 } });
    const byBarcode = await searchPosItems({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, query: variant.barcode });
    expect(byBarcode[0].sku).toBe(AZU_48);
    const multi = await searchPosItems({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, query: "mom azul 48" });
    expect(multi.map((i) => i.sku)).toEqual([AZU_48]);
  });
});
