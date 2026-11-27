import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { deactivateVoucher, findVoucherLedgerMismatches, getVoucherLedger, issueVoucher, listVouchers, lookupVoucher, redeemVoucher, resolveVoucherCode, LOOKUP_MAX_ATTEMPTS } from "@/modules/vouchers";
import { expectAppError, expectInvariants, newKey, resetDemo, tx, type Fixtures } from "./helpers";
import { insertVoucher, openCaja, PBA_XL, sellPos, setSetting } from "./returns-helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});
afterEach(() => vi.unstubAllEnvs());

const issue = (amount = 20_000, extra: { code?: string; actor?: Fixtures["actors"]["vendRga"]; locationId?: string } = {}) =>
  tx((t) =>
    issueVoucher(t, {
      actor: extra.actor ?? f.actors.vendRga,
      locationId: extra.locationId ?? f.loc.TIENDA_RANCAGUA,
      amount,
      returnId: "ret-test",
      idempotencyKey: newKey("vale"),
      code: extra.code,
    }),
  );

const redeem = (voucherId: string, maxAmount: number, extra: { locationId?: string; actor?: Fixtures["actors"]["vendRga"] } = {}) =>
  tx((t) =>
    redeemVoucher(t, {
      actor: extra.actor ?? f.actors.vendRga,
      locationId: extra.locationId ?? f.loc.TIENDA_RANCAGUA,
      voucherId,
      maxAmount,
      saleId: "sale-test",
      idempotencyKey: newKey("canje"),
    }),
  );

describe("emisión", () => {
  it("crea el vale con saldo = monto inicial, el movimiento EMISION y vence a los 90 días (valor por omisión, S-08)", async () => {
    const v = await issue(20_000);
    expect(v.code).toMatch(/^VAL-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    const row = await db.voucher.findUniqueOrThrow({ where: { id: v.id }, include: { movements: true } });
    expect(row.initialAmount).toBe(20_000);
    expect(row.balance).toBe(20_000);
    expect(row.active).toBe(true);
    expect(row.movements).toHaveLength(1);
    expect(row.movements[0]).toMatchObject({ type: "EMISION", amount: 20_000, balanceAfter: 20_000, refType: "RETURN", refId: "ret-test" });
    const days = (row.expiresAt.getTime() - row.createdAt.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThan(90.1);
    expect(await findVoucherLedgerMismatches()).toEqual([]);
  });

  it("la vigencia sale de settings.store_credit_validity_days cuando existe", async () => {
    await setSetting("store_credit_validity_days", 10);
    const v = await issue(5_000);
    const row = await db.voucher.findUniqueOrThrow({ where: { id: v.id } });
    expect((row.expiresAt.getTime() - row.createdAt.getTime()) / 86_400_000).toBeCloseTo(10, 1);
  });

  it("audit_log guarda solo los últimos 4 caracteres del código (es una credencial al portador)", async () => {
    const v = await issue(5_000);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "VOUCHER_ISSUE", entityId: v.id } });
    expect(JSON.stringify(log)).not.toContain(v.code);
    expect((log.after as { codeEnd: string }).codeEnd).toBe(v.code.slice(-4));
  });

  it("un código fijo solo existe en la demo (DEMO_MODE) y no se repite", async () => {
    const v = await issue(5_000, { code: "VAL-DEMO-VALE-0001" });
    expect(v.code).toBe("VAL-DEMO-VALE-0001");
    await expectAppError(issue(5_000, { code: "VAL-DEMO-VALE-0001" }), "CONFLICT", /Ya existe/);
    vi.stubEnv("DEMO_MODE", "false");
    await expectAppError(issue(5_000, { code: "VAL-DEMO-VALE-0002" }), "FORBIDDEN");
  });

  it("acceso: la vendedora de Rancagua no emite en la bodega; Belén sí en cualquiera", async () => {
    await expectAppError(issue(5_000, { locationId: f.loc.BODEGA }), "FORBIDDEN");
    const v = await issue(5_000, { actor: f.actors.belen, locationId: f.loc.BODEGA });
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).issuedLocationId).toBe(f.loc.BODEGA);
  });

  it("rechaza montos inválidos", async () => {
    await expectAppError(issue(0), "VALIDATION");
    await expectAppError(issue(-5), "VALIDATION");
    await expectAppError(issue(10.5), "VALIDATION");
  });
});

describe("canje (uso parcial)", () => {
  it("descuenta lo pedido y deja el saldo y un movimiento CANJE negativo", async () => {
    const v = await issue(20_000);
    const r = await redeem(v.id, 8_990);
    expect(r).toMatchObject({ amount: 8_990, balanceAfter: 11_010 });
    const ledger = await getVoucherLedger(f.actors.belen, v.id);
    expect(ledger.voucher).toMatchObject({ balance: 11_010, status: "VIGENTE" });
    expect(ledger.movements.map((m) => [m.type, m.amount, m.balanceAfter])).toEqual([
      ["EMISION", 20_000, 20_000],
      ["CANJE", -8_990, 11_010],
    ]);
  });

  it("si lo pedido supera el saldo, canjea solo el saldo; después ya no hay saldo", async () => {
    const v = await issue(5_000);
    expect((await redeem(v.id, 8_990)).amount).toBe(5_000);
    await expectAppError(redeem(v.id, 100), "VALIDATION", /no tiene saldo/);
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).balance).toBe(0);
    expect((await getVoucherLedger(f.actors.belen, v.id)).voucher.status).toBe("AGOTADO");
    expect(await findVoucherLedgerMismatches()).toEqual([]);
  });

  it("vale vencido → rechazo con la fecha", async () => {
    const v = await insertVoucher(f, { code: "VAL-VENC-IDOS-0001", amount: 10_000, expiresAt: new Date(Date.now() - 86_400_000) });
    await expectAppError(redeem(v.id, 1_000), "VALIDATION", /venció el/);
    expect((await getVoucherLedger(f.actors.belen, v.id)).voucher.status).toBe("VENCIDO");
  });

  it("vale desactivado → rechazo", async () => {
    const v = await insertVoucher(f, { code: "VAL-INAC-TIVO-0001", amount: 10_000, active: false });
    await expectAppError(redeem(v.id, 1_000), "VALIDATION", /desactivado/);
  });

  it("vale inexistente → NOT_FOUND", async () => {
    await expectAppError(redeem("no-existe", 1_000), "NOT_FOUND");
  });

  it("acceso cruzado: la vendedora de Rancagua no canjea en la bodega; el canje se hace en la ubicación del actor", async () => {
    const v = await issue(10_000);
    await expectAppError(redeem(v.id, 1_000, { locationId: f.loc.BODEGA }), "FORBIDDEN");
    await expectAppError(redeem(v.id, 1_000, { actor: f.actors.bodega }), "FORBIDDEN"); // el rol BODEGA no vende
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).balance).toBe(10_000);
  });

  it("el vale emitido en una ubicación se canjea en otra tienda (no es de una tienda)", async () => {
    const v = await issue(10_000, { actor: f.actors.belen, locationId: f.loc.BODEGA });
    expect((await redeem(v.id, 4_000)).amount).toBe(4_000);
  });
});

describe("búsqueda por código con límite de intentos", () => {
  const miss = () => resolveVoucherCode(db, f.actors.vendRga, "VAL-ZZZZ-ZZZZ-ZZZZ");

  it("encuentra el vale por código escrito de cualquier forma", async () => {
    const v = await issue(10_000);
    const view = await lookupVoucher(f.actors.vendRga, v.code.toLowerCase().replaceAll("-", " "));
    expect(view).toMatchObject({ id: v.id, balance: 10_000, status: "VIGENTE" });
  });

  it(`tras ${LOOKUP_MAX_ATTEMPTS} códigos incorrectos seguidos bloquea al usuario, incluso con un código correcto`, async () => {
    const v = await issue(10_000);
    for (let i = 0; i < LOOKUP_MAX_ATTEMPTS; i++) await expectAppError(miss(), "NOT_FOUND");
    await expectAppError(lookupVoucher(f.actors.vendRga, v.code), "FORBIDDEN", /Demasiados códigos/);
    // otra vendedora no se ve afectada: el contador es por usuario
    expect((await lookupVoucher(f.actors.vendRga2, v.code)).id).toBe(v.id);
  });

  it("un acierto reinicia el contador", async () => {
    const v = await issue(10_000);
    for (let i = 0; i < LOOKUP_MAX_ATTEMPTS - 1; i++) await expectAppError(miss(), "NOT_FOUND");
    await lookupVoucher(f.actors.vendRga, v.code); // acierta: contador a 0
    for (let i = 0; i < LOOKUP_MAX_ATTEMPTS - 1; i++) await expectAppError(miss(), "NOT_FOUND");
    expect((await lookupVoucher(f.actors.vendRga, v.code)).id).toBe(v.id);
  });

  it("un texto que no parece un código también cuenta como intento y no consulta la tabla", async () => {
    for (let i = 0; i < LOOKUP_MAX_ATTEMPTS; i++) await expectAppError(resolveVoucherCode(db, f.actors.vendRga, "hola"), "NOT_FOUND");
    await expectAppError(resolveVoucherCode(db, f.actors.vendRga, "hola"), "FORBIDDEN");
  });

  it("la clave del contador es un SHA-256 del id: no queda el id del usuario ni el código en auth_throttles", async () => {
    await expectAppError(miss(), "NOT_FOUND");
    const rows = await db.authThrottle.findMany({ where: { key: { startsWith: "voucher:" } } });
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe(`voucher:${createHash("sha256").update(f.actors.vendRga.id).digest("hex")}`);
    expect(rows[0].key).not.toContain(f.actors.vendRga.id);
    expect(rows[0].key).not.toContain("ZZZZ");
  });

  it("el rol BODEGA no consulta vales", async () => {
    await expectAppError(lookupVoucher(f.actors.bodega, "VAL-ZZZZ-ZZZZ-ZZZZ"), "FORBIDDEN");
  });
});

describe("doble gasto: canje simultáneo del mismo vale desde dos ventas", () => {
  it("con saldo para UNA sola venta: gana una, la otra se rechaza y el saldo nunca queda negativo", async () => {
    await openCaja(f);
    const v = await insertVoucher(f, { code: "VAL-DOBL-EGAS-0001", amount: 8_990 });
    const results = await Promise.allSettled([
      sellPos(f, [{ sku: PBA_XL }], { voucherCode: v.code }),
      sellPos(f, [{ sku: PBA_XL }], { voucherCode: v.code }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as Error).message).toMatch(/no tiene saldo|cambió mientras se cobraba/);
    const row = await db.voucher.findUniqueOrThrow({ where: { id: v.id } });
    expect(row.balance).toBe(0);
    const spent = await db.voucherMovement.aggregate({ where: { voucherId: v.id, type: "CANJE" }, _sum: { amount: true } });
    expect(spent._sum.amount).toBe(-8_990);
    expect(await db.sale.count()).toBe(1);
    expect(await findVoucherLedgerMismatches()).toEqual([]);
    await expectInvariants();
  });

  it("con saldo para una venta y media: las dos tienen éxito y entre las dos gastan EXACTAMENTE el saldo", async () => {
    await openCaja(f);
    const v = await insertVoucher(f, { code: "VAL-DOBL-EGAS-0002", amount: 12_000 });
    const results = await Promise.allSettled([
      sellPos(f, [{ sku: PBA_XL }], { voucherCode: v.code }),
      sellPos(f, [{ sku: PBA_XL }], { voucherCode: v.code }),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const payments = await db.payment.findMany({ where: { voucherId: v.id } });
    expect(payments.map((p) => p.amount).sort((a, b) => a - b)).toEqual([3_010, 8_990]);
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).balance).toBe(0);
    // cada venta cuadra: Σ pagos = total + redondeo
    for (const s of await db.sale.findMany({ include: { payments: true } })) {
      expect(s.payments.reduce((a, p) => a + p.amount, 0)).toBe(s.total + s.roundingAdjustment);
    }
    expect(await findVoucherLedgerMismatches()).toEqual([]);
    await expectInvariants();
  });
});

describe("inmutabilidad y reglas de la BD", () => {
  it("voucher_movements es solo INSERT: UPDATE y DELETE se rechazan", async () => {
    const v = await issue(10_000);
    await expect(db.$executeRaw`UPDATE voucher_movements SET amount = 1 WHERE voucher_id = ${v.id}`).rejects.toThrow(/inmutable/);
    await expect(db.$executeRaw`DELETE FROM voucher_movements WHERE voucher_id = ${v.id}`).rejects.toThrow(/inmutable/);
    expect(await db.voucherMovement.count({ where: { voucherId: v.id } })).toBe(1);
  });

  it("el vale no se borra y no cambia su código, monto inicial, vencimiento ni origen; el saldo sí cambia", async () => {
    const v = await issue(10_000);
    await expect(db.$executeRaw`DELETE FROM vouchers WHERE id = ${v.id}`).rejects.toThrow(/no se borra/);
    await expect(db.$executeRaw`UPDATE vouchers SET code = 'VAL-OTRO-OTRO-OTRO' WHERE id = ${v.id}`).rejects.toThrow(/no se modifican/);
    await expect(db.$executeRaw`UPDATE vouchers SET initial_amount = 99999, balance = 99999 WHERE id = ${v.id}`).rejects.toThrow(/no se modifican/);
    await expect(db.$executeRaw`UPDATE vouchers SET expires_at = expires_at + interval '1 day' WHERE id = ${v.id}`).rejects.toThrow(/no se modifican/);
    await expect(db.$executeRaw`UPDATE vouchers SET created_by = ${f.actors.belen.id} WHERE id = ${v.id}`).rejects.toThrow(/no se modifican/);
    await db.$executeRaw`UPDATE vouchers SET balance = 7000 WHERE id = ${v.id}`;
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).balance).toBe(7_000);
  });

  it("CHECK: saldo entre 0 y el monto inicial; movimientos con tipo y signo coherentes", async () => {
    const v = await issue(10_000);
    await expect(db.$executeRaw`UPDATE vouchers SET balance = 10001 WHERE id = ${v.id}`).rejects.toThrow(/vouchers_amounts_chk/);
    await expect(db.$executeRaw`UPDATE vouchers SET balance = -1 WHERE id = ${v.id}`).rejects.toThrow(/vouchers_amounts_chk/);
    const bad = (type: string, amount: number) =>
      db.$executeRaw`INSERT INTO voucher_movements (id, voucher_id, type, amount, balance_after, ref_type, user_id, idempotency_key)
        VALUES (${newKey("m")}, ${v.id}, ${type}::voucher_movement_type, ${amount}, 0, 'SALE'::ref_type, ${f.actors.belen.id}, ${newKey("k")})`;
    await expect(bad("EMISION", -100)).rejects.toThrow(/type_sign_chk/);
    await expect(bad("CANJE", 100)).rejects.toThrow(/type_sign_chk/);
    await expect(bad("REPOSICION", -100)).rejects.toThrow(/type_sign_chk/);
    await expect(bad("CANJE", 0)).rejects.toThrow(/amount_chk|type_sign_chk/);
  });

  it("las FK financieras son RESTRICT: no se borra el vale canjeado, ni la aprobación o la caja de una devolución", async () => {
    const rows = await db.$queryRaw<{ conname: string; confdeltype: string }[]>`
      SELECT conname, confdeltype::text FROM pg_constraint
      WHERE conname IN ('returns_approval_id_fkey', 'returns_cash_session_id_fkey', 'returns_voucher_id_fkey', 'returns_new_sale_id_fkey', 'payments_voucher_id_fkey')`;
    expect(rows).toHaveLength(5);
    for (const r of rows) expect(r.confdeltype, r.conname).toBe("r");
  });

  it("el índice parcial de payments(voucher_id) existe y solo cubre pagos con vale", async () => {
    const [row] = await db.$queryRaw<{ indexdef: string }[]>`SELECT indexdef FROM pg_indexes WHERE indexname = 'payments_voucher_id_idx'`;
    expect(row.indexdef).toMatch(/WHERE \(voucher_id IS NOT NULL\)/);
  });
});

describe("desactivar y listar (Belén)", () => {
  it("solo ADMIN desactiva; un vale desactivado no se canjea; desactivar dos veces es CONFLICT; queda en audit_log", async () => {
    const v = await issue(10_000);
    await expectAppError(deactivateVoucher({ actor: f.actors.vendRga, voucherId: v.id, reason: "Se perdió" }), "FORBIDDEN");
    await deactivateVoucher({ actor: f.actors.belen, voucherId: v.id, reason: "La clienta lo perdió" });
    await expectAppError(deactivateVoucher({ actor: f.actors.belen, voucherId: v.id, reason: "otra vez" }), "CONFLICT");
    await expectAppError(redeem(v.id, 1_000), "VALIDATION", /desactivado/);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "VOUCHER_DEACTIVATE", entityId: v.id } });
    expect(log.userId).toBe(f.actors.belen.id);
    expect(JSON.stringify(log)).not.toContain(v.code);
    // el vale y su historial siguen ahí (sin borrado físico)
    expect((await getVoucherLedger(f.actors.belen, v.id)).voucher.status).toBe("INACTIVO");
  });

  it("la lista filtra por estado calculado y solo la ve ADMIN", async () => {
    await insertVoucher(f, { code: "VAL-LIST-AAAA-0001", amount: 10_000 }); // vigente
    await insertVoucher(f, { code: "VAL-LIST-AAAA-0002", amount: 10_000, balance: 0 }); // agotado
    await insertVoucher(f, { code: "VAL-LIST-AAAA-0003", amount: 10_000, expiresAt: new Date(Date.now() - 1_000) }); // vencido
    await insertVoucher(f, { code: "VAL-LIST-AAAA-0004", amount: 10_000, active: false }); // inactivo
    const codes = async (status: Parameters<typeof listVouchers>[0]["status"]) => (await listVouchers({ actor: f.actors.belen, status })).map((v) => v.code.slice(-4));
    expect(await codes("VIGENTE")).toEqual(["0001"]);
    expect(await codes("AGOTADO")).toEqual(["0002"]);
    expect(await codes("VENCIDO")).toEqual(["0003"]);
    expect(await codes("INACTIVO")).toEqual(["0004"]);
    expect((await codes("TODOS")).sort()).toEqual(["0001", "0002", "0003", "0004"]);
    await expectAppError(listVouchers({ actor: f.actors.vendRga }), "FORBIDDEN");
    await expectAppError(getVoucherLedger(f.actors.vendRga, "x"), "FORBIDDEN");
  });
});

describe("invariante del libro: saldo = monto inicial + movimientos posteriores a la emisión", () => {
  it("detecta un saldo que no cuadra con sus movimientos", async () => {
    const v = await issue(10_000);
    await redeem(v.id, 3_000);
    expect(await findVoucherLedgerMismatches()).toEqual([]);
    await db.$executeRaw`UPDATE vouchers SET balance = 9000 WHERE id = ${v.id}`; // alguien tocó el saldo sin movimiento
    const mismatches = await findVoucherLedgerMismatches();
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({ code: v.code, balance: 9_000, initialAmount: 10_000, movementsSum: 7_000 });
  });
});
