import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { requestVoidApproval, voidSale } from "@/modules/sales";
import { findVoucherLedgerMismatches } from "@/modules/vouchers";
import { expectAppError, expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";
import { cambio, DINERO_TRANSFERENCIA, doReturn, JMT_AZU, openCaja, PBA_XL, sellPos, VALE, type SoldSale } from "./returns-helpers";

// Devolver y anular la MISMA venta a la vez (regla 5): sin bloquear la venta, las dos podían pasar (DEVOLUCION suma y
// ANULACION_VENTA repone todo → stock duplicado). Orden de bloqueo: venta → caja → stock.

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const store = () => f.loc.TIENDA_RANCAGUA;
const onHand = async (sku: string) => (await stockOf(await f.variant(sku), store())).onHand;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const voidIt = (sale: SoldSale) => voidSale({ actor: f.actors.belen, saleId: sale.saleId, reason: "Error al cobrar", idempotencyKey: newKey("anular") });

const noDeadlock = (results: PromiseSettledResult<unknown>[], label: string) => {
  for (const r of results) {
    if (r.status === "rejected") expect(String((r.reason as Error).message), label).not.toMatch(/deadlock|40P01|interbloqueo/i);
  }
};

describe("devolver vs anular la misma venta, en paralelo", () => {
  it("una gana y la otra falla limpio con CONFLICT; el stock sube UNA sola vez (varias rondas, en los dos órdenes de llegada)", async () => {
    await openCaja(f);
    let returnWins = 0;
    let voidWins = 0;
    for (let round = 0; round < 12; round++) {
      const sale = await sellPos(f, [{ sku: PBA_XL }]);
      const after = await onHand(PBA_XL); // con la venta ya descontada
      const doIt = () => doReturn(f, sale, [{ sku: PBA_XL }], VALE, { actor: f.actors.belen });
      const results = await Promise.allSettled(
        round % 2 === 0
          ? [doIt(), sleep((round % 4) * 4).then(() => voidIt(sale))]
          : [sleep((round % 4) * 4).then(() => voidIt(sale)), doIt()],
      );
      noDeadlock(results, `ronda ${round}`);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled, `ronda ${round}: exactamente una`).toHaveLength(1);
      const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect((lost.reason as { code: string }).code, `ronda ${round}`).toBe("CONFLICT");

      // stock: +1 exactamente (devolución O anulación, nunca las dos)
      expect(await onHand(PBA_XL), `ronda ${round}`).toBe(after + 1);
      const returned = await db.return.count({ where: { originalSaleId: sale.saleId } });
      const status = (await db.sale.findUniqueOrThrow({ where: { id: sale.saleId } })).status;
      expect(returned === 1 && status === "COMPLETADA" ? "return" : returned === 0 && status === "ANULADA" ? "void" : "mal").not.toBe("mal");
      if (returned === 1) returnWins++;
      else voidWins++;
      await expectInvariants();
      expect(await findVoucherLedgerMismatches()).toEqual([]);
    }
    expect(returnWins + voidWins).toBe(12);
  });

  it("un CAMBIO contra la anulación de la misma venta tampoco duplica ni se bloquea", async () => {
    await openCaja(f);
    for (let round = 0; round < 6; round++) {
      const sale = await sellPos(f, [{ sku: PBA_XL }]);
      const pBefore = await onHand(PBA_XL);
      const jBefore = await onHand(JMT_AZU);
      const results = await Promise.allSettled([
        doReturn(f, sale, [{ sku: PBA_XL }], await cambio(f, [{ sku: JMT_AZU }], { method: "DEBITO", reference: `C-${round}` }), { actor: f.actors.belen }),
        sleep((round % 3) * 5).then(() => voidIt(sale)),
      ]);
      noDeadlock(results, `ronda ${round}`);
      expect(results.filter((r) => r.status === "fulfilled"), `ronda ${round}`).toHaveLength(1);
      const status = (await db.sale.findUniqueOrThrow({ where: { id: sale.saleId } })).status;
      if (status === "ANULADA") {
        expect(await onHand(PBA_XL)).toBe(pBefore + 1); // la anulación repuso lo vendido
        expect(await onHand(JMT_AZU)).toBe(jBefore); // el cambio no ocurrió
      } else {
        expect(await onHand(PBA_XL)).toBe(pBefore + 1); // la devolución repuso la prenda
        expect(await onHand(JMT_AZU)).toBe(jBefore - 1); // y se llevó la nueva
      }
      await expectInvariants();
      expect(await findVoucherLedgerMismatches()).toEqual([]);
      // limpia para la siguiente ronda: la caja de la anulación/cambio se mantiene abierta
    }
  });

  it("devolución parcial ya hecha: la anulación posterior se rechaza; anulación ya hecha: la devolución posterior se rechaza", async () => {
    await openCaja(f);
    const a = await sellPos(f, [{ sku: PBA_XL, qty: 2 }]);
    await doReturn(f, a, [{ sku: PBA_XL }], VALE);
    await expectAppError(voidIt(a), "CONFLICT", /devolución/);
    const b = await sellPos(f, [{ sku: PBA_XL }]);
    await voidIt(b);
    await expectAppError(doReturn(f, b, [{ sku: PBA_XL }], VALE), "CONFLICT", /anulada/);
  });
});

describe("anular la venta nueva de un cambio (S-11)", () => {
  async function exchange() {
    await openCaja(f);
    const original = await sellPos(f, [{ sku: PBA_XL }]);
    const { result } = await doReturn(f, original, [{ sku: PBA_XL }], await cambio(f, [{ sku: JMT_AZU }], { method: "DEBITO", reference: "V-1" }));
    const newSale: SoldSale = { saleId: result.newSale!.id, number: result.newSale!.number, total: result.newSale!.total, line: {} };
    return { original, result, newSale };
  }

  it("no se puede anular (ni Belén ni pidiendo aprobación): la venta nueva es parte del cambio y no cambia nada", async () => {
    const { result, newSale } = await exchange();
    const stockBefore = { p: await onHand(PBA_XL), j: await onHand(JMT_AZU) };
    await expectAppError(voidIt(newSale), "CONFLICT", /cambio de una devolución/);
    await expectAppError(requestVoidApproval({ actor: f.actors.vendRga, saleId: newSale.saleId, reason: "Error al cobrar", idempotencyKey: newKey("sol") }), "CONFLICT", /cambio de una devolución/);
    expect((await db.sale.findUniqueOrThrow({ where: { id: newSale.saleId } })).status).toBe("COMPLETADA");
    // el vale temporal sigue como lo dejó el cambio: ni se repone saldo ni se crea ningún movimiento nuevo
    const voucher = await db.voucher.findUniqueOrThrow({ where: { id: result.voucher!.id }, include: { movements: true } });
    expect(voucher.balance).toBe(0);
    expect(voucher.movements.map((m) => m.type)).toEqual(["EMISION", "CANJE"]);
    expect({ p: await onHand(PBA_XL), j: await onHand(JMT_AZU) }).toEqual(stockBefore);
    expect(await db.auditLog.count({ where: { action: "SALE_VOID" } })).toBe(0);
    expect(await findVoucherLedgerMismatches()).toEqual([]);
  });

  it("tampoco se anula la venta ORIGINAL de un cambio", async () => {
    const { original } = await exchange();
    await expectAppError(voidIt(original), "CONFLICT", /devolución/);
  });

  it("para deshacer un cambio se devuelve la prenda nueva: como se pagó con el vale del cambio, solo en vale o cambio (S-07)", async () => {
    const { newSale } = await exchange();
    const line = await db.saleLine.findFirstOrThrow({ where: { saleId: newSale.saleId } });
    const sale: SoldSale = { ...newSale, line: { [JMT_AZU]: line.id } };
    await expectAppError(doReturn(f, sale, [{ sku: JMT_AZU }], DINERO_TRANSFERENCIA, { actor: f.actors.belen }), "VALIDATION", /pagó \(en parte\) con vale/);
    const { result } = await doReturn(f, sale, [{ sku: JMT_AZU }], VALE);
    expect(result.valueReturned).toBe(29_990);
    expect(result.voucher!.balance).toBe(29_990);
    await expectInvariants();
  });
});
