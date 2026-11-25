import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { closeCashSession, getCashClosingTotals } from "@/modules/sales";
import { expectAppError, expectInvariants, resetDemo, type Fixtures } from "./helpers";
import { approvedReturn, cambio, closeCajaExact, DINERO_EFECTIVO, doReturn, JMT_AZU, openCaja, PBA_XL, sellPos, VALE } from "./returns-helpers";

// Caja y cuadratura con devoluciones y vales (ADR-021): el reembolso en efectivo sale de la caja ABIERTA; los vales no mueven
// efectivo y se informan aparte.

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const totals = (sessionId: string) => getCashClosingTotals(f.actors.vendRga, sessionId);

describe("reembolso en efectivo", () => {
  it("sale de la caja abierta: queda ligado a la caja y baja el efectivo esperado", async () => {
    const session = await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }], { method: "EFECTIVO" });
    expect((await totals(session.id)).expectedCash).toBe(58_990);

    const approvalId = await approvedReturn(f, sale, [{ sku: PBA_XL }], DINERO_EFECTIVO);
    const { result } = await doReturn(f, sale, [{ sku: PBA_XL }], DINERO_EFECTIVO, { approvalId });
    expect(result).toMatchObject({ refundMethod: "EFECTIVO", refundAmount: 8_990, roundingAdjustment: 0 });
    expect((await db.return.findUniqueOrThrow({ where: { id: result.id } })).cashSessionId).toBe(session.id);

    const t = await totals(session.id);
    expect(t).toMatchObject({ cashCollected: 8_990, cashReturned: 8_990, expectedCash: 50_000 });
    // la cuadratura cierra exacta
    const closed = await closeCajaExact(f, session.id);
    expect(closed).toMatchObject({ status: "CERRADA", difference: 0, expectedCash: 50_000 });
  });

  it("sin caja abierta se bloquea (y no queda nada hecho)", async () => {
    const session = await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }], { method: "EFECTIVO" });
    await closeCajaExact(f, session.id);
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], DINERO_EFECTIVO, { actor: f.actors.belen }), "CONFLICT", /No hay caja abierta/);
    expect(await db.return.count()).toBe(0);
    expect((await db.saleLine.findFirstOrThrow({ where: { saleId: sale.saleId } })).returnedQuantity).toBe(0);
    await expectInvariants();
  });

  it("una venta de una caja ya cerrada se reembolsa desde la caja que está abierta hoy", async () => {
    const s1 = await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }], { method: "EFECTIVO" });
    const closed1 = await closeCajaExact(f, s1.id);
    const s2 = await openCaja(f, 30_000);
    const { result } = await doReturn(f, sale, [{ sku: PBA_XL }], DINERO_EFECTIVO, { actor: f.actors.belen });
    expect((await db.return.findUniqueOrThrow({ where: { id: result.id } })).cashSessionId).toBe(s2.id);
    expect((await totals(s2.id)).expectedCash).toBe(30_000 - 8_990);
    // la caja cerrada no cambia
    expect((await db.cashSession.findUniqueOrThrow({ where: { id: s1.id } })).expectedCash).toBe(closed1.expectedCash);
  });

  it("el efectivo se redondea a $10 (RN-19) y el ajuste queda en la devolución y en la cuadratura", async () => {
    const session = await openCaja(f);
    // Belén vende con 33,33 % de descuento: $8.990 − $2.996 = $5.994 (cobro en efectivo $5.990)
    const sale = await sellPos(f, [{ sku: PBA_XL, discountBps: 3333 }], { actor: f.actors.belen, method: "EFECTIVO" });
    expect(sale.total).toBe(5_994);
    const { result } = await doReturn(f, sale, [{ sku: PBA_XL }], DINERO_EFECTIVO, { actor: f.actors.belen });
    expect(result).toMatchObject({ valueReturned: 5_994, refundAmount: 5_990, roundingAdjustment: -4 });
    expect(result.refundAmount).toBe(result.valueReturned + result.roundingAdjustment);
    const t = await totals(session.id);
    expect(t.cashCollected).toBe(5_990);
    expect(t.cashReturned).toBe(5_990);
    expect(t.expectedCash).toBe(50_000);
  });

  it("un reembolso que no es en efectivo no toca la caja", async () => {
    const session = await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await doReturn(f, sale, [{ sku: PBA_XL }], { kind: "DINERO", method: "TRANSFERENCIA", reference: "TRF-1" }, { actor: f.actors.belen });
    const t = await totals(session.id);
    expect(t.cashReturned).toBe(0);
    expect(t.expectedCash).toBe(50_000);
    expect((await db.return.findFirstOrThrow()).cashSessionId).toBeNull();
  });

  it("una caja con un reembolso no cierra con diferencia: contar lo esperado cuadra, contar de más no", async () => {
    const session = await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }], { method: "EFECTIVO" });
    await doReturn(f, sale, [{ sku: PBA_XL }], DINERO_EFECTIVO, { actor: f.actors.belen });
    await expectAppError(
      closeCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, countedCash: 58_990 }),
      "VALIDATION",
      /diferencia de \$8\.990/, // si no se descontara el reembolso, faltaría esa plata
    );
    expect((await closeCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, countedCash: 50_000 })).difference).toBe(0);
    expect(session.id).toBeTruthy();
  });
});

describe("vales y cambios en la cuadratura (no mueven efectivo)", () => {
  it("una devolución a vale no toca el efectivo: se informa como vale emitido", async () => {
    const session = await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }], { method: "EFECTIVO" });
    await doReturn(f, sale, [{ sku: PBA_XL }], VALE);
    const t = await totals(session.id);
    expect(t).toMatchObject({ vouchersIssued: 8_990, vouchersRedeemed: 0, cashReturned: 0, cashCollected: 8_990, expectedCash: 58_990 });
  });

  it("un cambio con diferencia a pagar en efectivo: entra solo la diferencia (el vale no es efectivo)", async () => {
    const session = await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await doReturn(f, sale, [{ sku: PBA_XL }], await cambio(f, [{ sku: JMT_AZU }], { method: "EFECTIVO", cashReceived: 30_000 }));
    const t = await totals(session.id);
    expect(t).toMatchObject({ cashCollected: 21_000, vouchersRedeemed: 8_990, vouchersIssued: 0, cashReturned: 0, expectedCash: 71_000 });
  });

  it("un cambio con saldo a favor informa solo el saldo como vale emitido", async () => {
    const session = await openCaja(f);
    const sale = await sellPos(f, [{ sku: JMT_AZU }]);
    await doReturn(f, sale, [{ sku: JMT_AZU }], await cambio(f, [{ sku: PBA_XL }]));
    const t = await totals(session.id);
    expect(t).toMatchObject({ vouchersIssued: 21_000, vouchersRedeemed: 8_990, expectedCash: 50_000 });
  });

  it("un cambio exige caja abierta (vende desde ella)", async () => {
    const session = await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await closeCajaExact(f, session.id);
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], await cambio(f, [{ sku: JMT_AZU }], { method: "DEBITO", reference: "V" })), "CONFLICT", /No hay caja abierta/);
    expect(await db.return.count()).toBe(0);
    await expectInvariants();
  });

  it("una devolución a vale NO necesita caja abierta (no mueve dinero)", async () => {
    const session = await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await closeCajaExact(f, session.id);
    const { result } = await doReturn(f, sale, [{ sku: PBA_XL }], VALE);
    expect(result.voucher).not.toBeNull();
    expect((await db.return.findUniqueOrThrow({ where: { id: result.id } })).cashSessionId).toBeNull();
  });
});
