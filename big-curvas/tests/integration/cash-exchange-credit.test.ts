import { beforeEach, describe, expect, it } from "vitest";
import { getCashClosingTotals } from "@/modules/sales";
import { expectInvariants, resetDemo, type Fixtures } from "./helpers";
import { cambio, closeCajaExact, doReturn, JMT_AZU, openCaja, PBA_XL, sellPos, VALE } from "./returns-helpers";
import { db } from "@/lib/db";

// El "crédito por cambio" del cierre de caja es solo una aclaración de cuánto de "Canjeados" es el crédito interno de un
// cambio. Emitidos, Canjeados y el efectivo esperado se calculan igual que antes.

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const totals = (sessionId: string) => getCashClosingTotals(f.actors.vendRga, sessionId);
const lastVoucherCode = async () => (await db.voucher.findFirstOrThrow({ where: { balance: { gt: 0 } }, orderBy: { createdAt: "desc" } })).code;

describe("crédito por cambio en el cierre de caja", () => {
  it("sin cambios (devolución a vale y su canje): crédito 0", async () => {
    const session = await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }], { method: "EFECTIVO" });
    await doReturn(f, sale, [{ sku: PBA_XL }], VALE);
    await sellPos(f, [{ sku: PBA_XL }], { voucherCode: await lastVoucherCode() });

    expect(await totals(session.id)).toMatchObject({ exchangeCredit: 0, vouchersIssued: 8_990, vouchersRedeemed: 8_990, cashReturned: 0, expectedCash: 58_990 });
    expect(await closeCajaExact(f, session.id)).toMatchObject({ status: "CERRADA", difference: 0, expectedCash: 58_990 });
  });

  it("con un cambio: el crédito es solo la parte del cambio y el cuadre no se mueve", async () => {
    const session = await openCaja(f);
    const first = await sellPos(f, [{ sku: PBA_XL, qty: 2 }], { method: "EFECTIVO" });
    await doReturn(f, first, [{ sku: PBA_XL }], VALE);
    await sellPos(f, [{ sku: PBA_XL }], { voucherCode: await lastVoucherCode() }); // canje normal: no es crédito por cambio
    // Cambio: se devuelven $8.990 y se lleva una prenda de $29.990 pagando $21.000 en efectivo.
    await doReturn(f, first, [{ sku: PBA_XL }], await cambio(f, [{ sku: JMT_AZU }], { method: "EFECTIVO", cashReceived: 21_000 }));

    const t = await totals(session.id);
    expect(t).toMatchObject({ exchangeCredit: 8_990, vouchersIssued: 8_990, vouchersRedeemed: 17_980, cashCollected: 38_980, cashReturned: 0, expectedCash: 88_980 });
    // El efectivo esperado sale solo del fondo y del efectivo cobrado: el crédito no suma ni resta.
    expect(t.expectedCash).toBe(50_000 + t.cashCollected - t.cashRefunded - t.cashReturned);
    expect(await closeCajaExact(f, session.id)).toMatchObject({ status: "CERRADA", difference: 0, expectedCash: 88_980 });
    await expectInvariants();
  });
});
