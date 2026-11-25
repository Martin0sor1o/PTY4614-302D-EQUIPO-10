import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { createSale } from "@/modules/sales";
import { deactivateVoucher, findVoucherLedgerMismatches, redeemVoucher } from "@/modules/vouchers";
import { expectAppError, expectInvariants, newKey, resetDemo, stockOf, tx, type Fixtures } from "./helpers";
import { insertVoucher, openCaja, PBA_XL } from "./returns-helpers";

// El canje de un vale se busca y se valida ANTES de abrir la transacción de la venta, solo para dar un mensaje temprano.
// Quien decide es el canje DENTRO de la transacción (bloqueo + UPDATE atómico `balance >= monto`) y, como red final, los CHECK de
// la base. Estos tests simulan que el vale cambia justo entre la validación previa y la transacción.

const hook = vi.hoisted(() => ({ afterPrecheck: null as null | (() => Promise<void>) }));
vi.mock("@/modules/vouchers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/vouchers")>();
  return {
    ...actual,
    assertVoucherUsable: async (...args: Parameters<typeof actual.assertVoucherUsable>) => {
      await actual.assertVoucherUsable(...args); // la validación previa PASA con el vale tal como estaba…
      await hook.afterPrecheck?.(); // …y recién después cambia el mundo
    },
  };
});

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
  hook.afterPrecheck = null;
});

async function sale(code: string, payment?: Parameters<typeof createSale>[0]["payment"]) {
  return createSale({
    actor: f.actors.vendRga,
    locationId: f.loc.TIENDA_RANCAGUA,
    lines: [{ variantId: await f.variant(PBA_XL), qty: 1, discountBps: 0 }],
    voucherCode: code,
    payment,
    idempotencyKey: newKey("venta"),
  });
}

/** Otra caja gasta `amount` del vale (en su propia transacción, ya confirmada) mientras esta venta está entre la validación y la transacción. */
const spend = (voucherId: string, amount: number) => () =>
  tx((t) => redeemVoucher(t, { actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, voucherId, maxAmount: amount, saleId: "otra-venta", idempotencyKey: newKey("otra") })).then(() => undefined);

const expectNothingLeft = async (voucherId: string, expectedBalance: number, stockBefore: number) => {
  expect(await db.sale.count()).toBe(0);
  expect((await db.voucher.findUniqueOrThrow({ where: { id: voucherId } })).balance).toBe(expectedBalance);
  expect((await stockOf(await f.variant(PBA_XL), f.loc.TIENDA_RANCAGUA)).onHand).toBe(stockBefore);
  expect(await db.payment.count({ where: { voucherId } })).toBe(0);
  expect(await findVoucherLedgerMismatches()).toEqual([]);
  await expectInvariants();
};

describe("el vale cambia entre la validación previa y la transacción", () => {
  it("se gasta por completo: la venta falla limpio (sin venta, sin pago, sin stock movido, sin descuadre)", async () => {
    await openCaja(f);
    const v = await insertVoucher(f, { code: "VAL-RACE-AAAA-0001", amount: 8_990 });
    const stockBefore = (await stockOf(await f.variant(PBA_XL), f.loc.TIENDA_RANCAGUA)).onHand;
    hook.afterPrecheck = spend(v.id, 8_990);
    await expectAppError(sale(v.code, { method: "DEBITO", reference: "V-1" }), "VALIDATION", /no tiene saldo/);
    await expectNothingLeft(v.id, 0, stockBefore);
    // el único CANJE es el de la otra caja
    const canjes = await db.voucherMovement.findMany({ where: { voucherId: v.id, type: "CANJE" } });
    expect(canjes.map((m) => [m.amount, m.refId])).toEqual([[-8_990, "otra-venta"]]);
  });

  it("se gasta en parte: la transacción cobra solo el saldo que de verdad queda y el resto va por el otro medio", async () => {
    await openCaja(f);
    const v = await insertVoucher(f, { code: "VAL-RACE-AAAA-0002", amount: 8_990 });
    hook.afterPrecheck = spend(v.id, 5_980); // la validación previa vio $8.990; en la transacción quedan $3.010
    const { result } = await sale(v.code, { method: "DEBITO", reference: "V-2" });
    const pays = await db.payment.findMany({ where: { saleId: result.id }, orderBy: { amount: "asc" } });
    expect(pays.map((p) => [p.method, p.amount])).toEqual([["VALE", 3_010], ["DEBITO", 5_980]]);
    expect(pays.reduce((a, p) => a + p.amount, 0)).toBe(result.total + result.roundingAdjustment);
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).balance).toBe(0);
    expect(await findVoucherLedgerMismatches()).toEqual([]);
    await expectInvariants();
  });

  it("la venta se mandó sin medio de pago porque el vale parecía alcanzar, pero ya no alcanza: falla limpio y el saldo que queda no se toca", async () => {
    await openCaja(f);
    const v = await insertVoucher(f, { code: "VAL-RACE-AAAA-0003", amount: 8_990 });
    const stockBefore = (await stockOf(await f.variant(PBA_XL), f.loc.TIENDA_RANCAGUA)).onHand;
    hook.afterPrecheck = spend(v.id, 5_980);
    await expectAppError(sale(v.code), "VALIDATION", /cubre \$3\.010 de \$8\.990: elige un medio de pago/);
    await expectNothingLeft(v.id, 3_010, stockBefore);
  });

  it("se desactiva en el medio: la venta falla limpio", async () => {
    await openCaja(f);
    const v = await insertVoucher(f, { code: "VAL-RACE-AAAA-0004", amount: 20_000 });
    const stockBefore = (await stockOf(await f.variant(PBA_XL), f.loc.TIENDA_RANCAGUA)).onHand;
    hook.afterPrecheck = () => deactivateVoucher({ actor: f.actors.belen, voucherId: v.id, reason: "La clienta lo perdió" });
    await expectAppError(sale(v.code, { method: "DEBITO", reference: "V-3" }), "VALIDATION", /desactivado/);
    await expectNothingLeft(v.id, 20_000, stockBefore);
  });

  it("la validación previa sí da el mensaje temprano cuando el vale ya estaba vencido o sin saldo (sin abrir la transacción)", async () => {
    await openCaja(f);
    const vencido = await insertVoucher(f, { code: "VAL-RACE-VENC-0001", amount: 8_990, expiresAt: new Date(Date.now() - 1_000) });
    const agotado = await insertVoucher(f, { code: "VAL-RACE-AGOT-0001", amount: 8_990, balance: 0 });
    await expectAppError(sale(vencido.code, { method: "DEBITO", reference: "V" }), "VALIDATION", /venció/);
    await expectAppError(sale(agotado.code, { method: "DEBITO", reference: "V" }), "VALIDATION", /no tiene saldo/);
    expect(await db.sale.count()).toBe(0);
  });

  it("red final: aunque algo intente dejar el saldo negativo, la base lo rechaza", async () => {
    const v = await insertVoucher(f, { code: "VAL-RACE-BBBB-0001", amount: 1_000, balance: 500 });
    await expect(db.$executeRaw`UPDATE vouchers SET balance = balance - 1000 WHERE id = ${v.id}`).rejects.toThrow(/vouchers_amounts_chk/);
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).balance).toBe(500);
  });
});
