import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { requestVoidApproval, createSale, getCashClosingTotals, listSalesOfDay, saleRequestSchema, voidSale } from "@/modules/sales";
import { findVoucherLedgerMismatches } from "@/modules/vouchers";
import { expectAppError, expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";
import { doReturn, insertVoucher, JMT_NEG, openCaja, PBA_XL, sellPos, VALE } from "./returns-helpers";

// Canje de un vale en el cobro del POS (ADR-021): el vale cubre min(saldo, total) y el resto va por UN medio de pago.

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

async function saleWithVoucher(code: string, payment?: Parameters<typeof createSale>[0]["payment"], key = newKey("venta"), sku = PBA_XL) {
  return createSale({
    actor: f.actors.vendRga,
    locationId: f.loc.TIENDA_RANCAGUA,
    lines: [{ variantId: await f.variant(sku), qty: 1, discountBps: 0 }],
    voucherCode: code,
    payment,
    idempotencyKey: key,
  });
}

const paymentsOf = (saleId: string) => db.payment.findMany({ where: { saleId }, orderBy: { amount: "desc" } });

describe("cobro con vale", () => {
  it("un vale con saldo de sobra cubre todo: un solo pago VALE y sin medio de pago", async () => {
    const session = await openCaja(f);
    const v = await insertVoucher(f, { code: "VAL-COBR-OTOD-0001", amount: 20_000 });
    const { result } = await saleWithVoucher(v.code);
    const pays = await paymentsOf(result.id);
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ method: "VALE", amount: 8_990, voucherId: v.id, reference: null, cashReceived: null });
    expect(result.roundingAdjustment).toBe(0);
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).balance).toBe(11_010);
    // la caja: un vale NO es efectivo ni tarjeta; se informa aparte y el efectivo esperado no se mueve
    const totals = await getCashClosingTotals(f.actors.vendRga, session.id);
    expect(totals).toMatchObject({ vouchersRedeemed: 8_990, cashCollected: 0, expectedCash: 50_000 });
    expect(Object.values(totals.byMethod).reduce((a, b) => a + b, 0)).toBe(0);
    expect(await findVoucherLedgerMismatches()).toEqual([]);
    await expectInvariants();
  });

  it("vale que no alcanza + tarjeta: VALE por el saldo y DEBITO por el resto", async () => {
    await openCaja(f);
    const v = await insertVoucher(f, { code: "VAL-COBR-OTOD-0002", amount: 5_000 });
    const { result } = await saleWithVoucher(v.code, { method: "DEBITO", reference: "V-1" });
    const pays = await paymentsOf(result.id);
    expect(pays.map((p) => [p.method, p.amount])).toEqual([["VALE", 5_000], ["DEBITO", 3_990]]);
    expect(pays.reduce((a, p) => a + p.amount, 0)).toBe(result.total + result.roundingAdjustment);
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).balance).toBe(0);
  });

  it("vale + efectivo: el redondeo de $10 aplica solo al resto en efectivo", async () => {
    const session = await openCaja(f);
    const v = await insertVoucher(f, { code: "VAL-COBR-OTOD-0003", amount: 5_003 });
    const { result } = await saleWithVoucher(v.code, { method: "EFECTIVO", cashReceived: 10_000 });
    const pays = await paymentsOf(result.id);
    expect(pays.map((p) => [p.method, p.amount])).toEqual([["VALE", 5_003], ["EFECTIVO", 3_990]]); // resto 3.987 → 3.990
    expect(result.roundingAdjustment).toBe(3);
    expect(pays.reduce((a, p) => a + p.amount, 0)).toBe(result.total + result.roundingAdjustment);
    const totals = await getCashClosingTotals(f.actors.vendRga, session.id);
    expect(totals.cashCollected).toBe(3_990);
    expect(totals.expectedCash).toBe(53_990);
  });

  it("si el resto en efectivo se redondea a $0 no hay pago en efectivo y el ajuste queda en la venta", async () => {
    await openCaja(f);
    const v = await insertVoucher(f, { code: "VAL-COBR-OTOD-0004", amount: 8_987 }); // resto $3 → $0 en efectivo
    const { result } = await saleWithVoucher(v.code, { method: "EFECTIVO", cashReceived: 1_000 });
    const pays = await paymentsOf(result.id);
    expect(pays.map((p) => [p.method, p.amount])).toEqual([["VALE", 8_987]]);
    expect(result.roundingAdjustment).toBe(-3);
    expect(pays.reduce((a, p) => a + p.amount, 0)).toBe(result.total + result.roundingAdjustment);
  });

  it("sin medio de pago para lo que el vale no cubre → VALIDATION, y no queda nada a medias", async () => {
    await openCaja(f);
    const v = await insertVoucher(f, { code: "VAL-COBR-OTOD-0005", amount: 5_000 });
    const before = await stockOf(await f.variant(PBA_XL), f.loc.TIENDA_RANCAGUA);
    await expectAppError(saleWithVoucher(v.code), "VALIDATION", /elige un medio de pago/);
    expect(await db.sale.count()).toBe(0);
    expect(await stockOf(await f.variant(PBA_XL), f.loc.TIENDA_RANCAGUA)).toEqual(before);
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).balance).toBe(5_000);
    expect(await db.voucherMovement.count({ where: { type: "CANJE" } })).toBe(0);
  });

  it("vale vencido, desactivado o inexistente → rechazo con el motivo y la venta no se hace", async () => {
    await openCaja(f);
    const expired = await insertVoucher(f, { code: "VAL-COBR-VENC-0001", amount: 20_000, expiresAt: new Date(Date.now() - 1_000) });
    const inactive = await insertVoucher(f, { code: "VAL-COBR-INAC-0001", amount: 20_000, active: false });
    await expectAppError(saleWithVoucher(expired.code, { method: "DEBITO", reference: "V" }), "VALIDATION", /venció/);
    await expectAppError(saleWithVoucher(inactive.code, { method: "DEBITO", reference: "V" }), "VALIDATION", /desactivado/);
    await expectAppError(saleWithVoucher("VAL-ZZZZ-ZZZZ-ZZZZ", { method: "DEBITO", reference: "V" }), "NOT_FOUND");
    expect(await db.sale.count()).toBe(0);
  });

  it("si falta stock, el canje se revierte con la venta (el vale queda intacto)", async () => {
    await openCaja(f);
    const v = await insertVoucher(f, { code: "VAL-COBR-STOC-0001", amount: 40_000 });
    await expectAppError(saleWithVoucher(v.code, undefined, newKey("v"), JMT_NEG), "STOCK_INSUFICIENTE");
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).balance).toBe(40_000);
    expect(await db.voucherMovement.count({ where: { voucherId: v.id, type: "CANJE" } })).toBe(0);
    await expectInvariants();
  });

  it("idempotencia: repetir la misma clave devuelve la misma venta y el vale se canjea una sola vez", async () => {
    await openCaja(f);
    const v = await insertVoucher(f, { code: "VAL-COBR-IDEM-0001", amount: 20_000 });
    const key = newKey("venta");
    const a = await saleWithVoucher(v.code, undefined, key);
    const b = await saleWithVoucher(v.code, undefined, key);
    expect(b.replayed).toBe(true);
    expect(b.result.id).toBe(a.result.id);
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).balance).toBe(11_010);
    expect(await db.voucherMovement.count({ where: { voucherId: v.id, type: "CANJE" } })).toBe(1);
  });

  it("acceso: la vendedora de otra ubicación no canjea en Rancagua", async () => {
    await openCaja(f);
    const v = await insertVoucher(f, { code: "VAL-COBR-ACCE-0001", amount: 20_000 });
    await expectAppError(
      createSale({
        actor: f.actors.bodega,
        locationId: f.loc.TIENDA_RANCAGUA,
        lines: [{ variantId: await f.variant(PBA_XL), qty: 1, discountBps: 0 }],
        voucherCode: v.code,
        idempotencyKey: newKey("v"),
      }),
      "FORBIDDEN",
    );
  });

  it("el esquema del navegador exige medio de pago, salvo que haya un vale", () => {
    const base = { lines: [{ variantId: "v", qty: 1, discountBps: 0 }], idempotencyKey: "clave-larga-1" };
    expect(saleRequestSchema.safeParse(base).success).toBe(false);
    expect(saleRequestSchema.safeParse({ ...base, voucherCode: "VAL-AAAA-BBBB-CCCC" }).success).toBe(true);
    expect(saleRequestSchema.safeParse({ ...base, payment: { method: "DEBITO", reference: "V-1" } }).success).toBe(true);
  });

  it("los reportes de la caja (ventas del día) no mezclan el vale con los medios de dinero", async () => {
    await openCaja(f);
    const v = await insertVoucher(f, { code: "VAL-COBR-REPO-0001", amount: 5_000 });
    await saleWithVoucher(v.code, { method: "DEBITO", reference: "V-1" });
    const day = await listSalesOfDay({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA });
    expect(day.totalsByMethod.DEBITO).toBe(3_990);
    expect(day.totalCollected).toBe(3_990);
  });
});

describe("anular una venta pagada con vale", () => {
  it("repone el saldo del vale con un movimiento REPOSICION y deja la reposición en audit_log", async () => {
    await openCaja(f);
    const v = await insertVoucher(f, { code: "VAL-ANUL-ARVA-0001", amount: 5_000 });
    const { result } = await saleWithVoucher(v.code, { method: "DEBITO", reference: "V-1" });
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).balance).toBe(0);

    await voidSale({ actor: f.actors.belen, saleId: result.id, reason: "Error al cobrar", idempotencyKey: newKey("anular") });
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).balance).toBe(5_000);
    const movements = await db.voucherMovement.findMany({ where: { voucherId: v.id }, orderBy: { createdAt: "asc" } });
    expect(movements.map((m) => [m.type, m.amount, m.balanceAfter])).toEqual([["EMISION", 5_000, 5_000], ["CANJE", -5_000, 0], ["REPOSICION", 5_000, 5_000]]);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "SALE_VOID", entityId: result.id } });
    expect((log.after as { voucherRestored: number }).voucherRestored).toBe(5_000);
    expect(await findVoucherLedgerMismatches()).toEqual([]);
    await expectInvariants();
  });
});

describe("anular una venta con devoluciones (S-11)", () => {
  it("no se anula una venta que ya tuvo una devolución, ni se puede pedir la aprobación", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }]);
    await doReturn(f, sale, [{ sku: PBA_XL, qty: 1 }], VALE);
    await expectAppError(voidSale({ actor: f.actors.belen, saleId: sale.saleId, reason: "Error al cobrar", idempotencyKey: newKey("anular") }), "CONFLICT", /devolución/);
    await expectAppError(requestVoidApproval({ actor: f.actors.vendRga, saleId: sale.saleId, reason: "Error al cobrar", idempotencyKey: newKey("sol") }), "CONFLICT", /devolución/);
    expect((await db.sale.findUniqueOrThrow({ where: { id: sale.saleId } })).status).toBe("COMPLETADA");
  });
});
