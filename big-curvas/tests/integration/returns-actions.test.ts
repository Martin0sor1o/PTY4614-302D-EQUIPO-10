import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { approveRequest } from "@/modules/approvals";
import { loginWithPassword, loginWithPin } from "@/modules/auth";
import { expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";
import { ageSession, createWebUser, DEVICE_COOKIE, linkDevice, LOCATION_COOKIE, SESSION_COOKIE, setPinFor } from "./auth-helpers";
import { confirmTestPayment, prepareTestOrder, registerTestOrder } from "./orders-helpers";
import { dispatchOrder } from "@/modules/orders";
import { insertVoucher, lineIds, openCaja, PBA_XL, sellPos, type SoldSale } from "./returns-helpers";

// Acciones y páginas de devoluciones con SESIONES REALES (cookie de caja con PIN y cookie web de la administradora): la ubicación
// sale de la sesión, nunca del navegador, y cada acción vuelve a exigir rol Y ubicación (regla 10).

const mocks = vi.hoisted(() => ({ jar: {} as Record<string, string> }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.jar[name] ? { name, value: mocks.jar[name] } : undefined),
    set: (name: string, value: string) => {
      mocks.jar[name] = value;
    },
    delete: (name: string) => {
      delete mocks.jar[name];
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
  for (const k of Object.keys(mocks.jar)) delete mocks.jar[k];
});
afterEach(() => vi.unstubAllEnvs());

async function asSeller() {
  const { token: deviceToken } = await linkDevice(f);
  const pin = await setPinFor(f, f.actors.vendRga.id);
  const { session } = await loginWithPin({ deviceToken, userId: f.actors.vendRga.id, pin });
  mocks.jar[SESSION_COOKIE] = session.token;
  mocks.jar[DEVICE_COOKIE] = deviceToken;
  return { token: session.token, deviceToken, pin };
}
async function asAdmin(locationId?: string) {
  const u = await createWebUser({ name: "Administradora de prueba" });
  const { session } = await loginWithPassword({ email: u.email, password: u.password });
  mocks.jar[SESSION_COOKIE] = session.token;
  if (locationId) mocks.jar[LOCATION_COOKIE] = locationId;
  return { token: session.token };
}
const reset = () => {
  for (const k of Object.keys(mocks.jar)) delete mocks.jar[k];
};

const actions = () => import("@/app/(app)/pos/devoluciones/actions");
const saleLines = (sale: SoldSale, qty = 1, condition: "VENDIBLE" | "DANADA" = "VENDIBLE") => [{ saleLineId: sale.line[PBA_XL], qty, condition }];
const stock = async (loc: string) => (await stockOf(await f.variant(PBA_XL), loc)).onHand;
/** Todo lo que viaja al navegador debe ser JSON puro (sin Date). */
const isPlainJson = (value: unknown) => expect(JSON.parse(JSON.stringify(value))).toEqual(value);

async function onlineDispatchedSale(): Promise<SoldSale> {
  const order = await registerTestOrder(f, [{ sku: PBA_XL }]);
  await confirmTestPayment(f, order.id);
  await prepareTestOrder(f, order);
  await dispatchOrder({ actor: f.actors.belen, orderId: order.id, courier: "Starken", trackingNumber: "STK-1", idempotencyKey: newKey("d") });
  const s = await db.sale.findUniqueOrThrow({ where: { onlineOrderId: order.id } });
  return { saleId: s.id, number: s.number, total: s.total, line: await lineIds(f, s.id, [PBA_XL]) };
}

describe("sin sesión", () => {
  it("todas las acciones de devoluciones responden UNAUTHENTICATED y no crean nada", async () => {
    const a = await actions();
    const vales = await import("@/app/(app)/vales/actions");
    const fail = { ok: false, code: "UNAUTHENTICATED" };
    expect(await a.searchReturnSalesAction("RGA")).toMatchObject(fail);
    expect(await a.getReturnSaleAction("x")).toMatchObject(fail);
    expect(await a.quoteReturnAction({ saleId: "x", lines: [{ saleLineId: "y", qty: 1, condition: "VENDIBLE" }], resolution: { kind: "VALE" } })).toMatchObject(fail);
    expect(await a.requestReturnApprovalAction({ saleId: "x", lines: [{ saleLineId: "y", qty: 1, condition: "VENDIBLE" }], resolution: { kind: "VALE" }, reason: "TALLA", idempotencyKey: newKey("k") })).toMatchObject(fail);
    expect(await a.createReturnAction({ saleId: "x", lines: [{ saleLineId: "y", qty: 1, condition: "VENDIBLE" }], resolution: { kind: "VALE" }, reason: "TALLA", idempotencyKey: newKey("k") })).toMatchObject(fail);
    expect(await a.lookupVoucherAction("VAL-AAAA-BBBB-CCCC")).toMatchObject(fail);
    expect(await vales.deactivateVoucherAction({ voucherId: "x", reason: "Se perdió" })).toMatchObject(fail);
    expect(await db.return.count()).toBe(0);
  });

  it("las páginas mandan a /login", async () => {
    const { default: ReturnsPage } = await import("@/app/(app)/pos/devoluciones/page");
    const { default: VouchersPage } = await import("@/app/(app)/vales/page");
    await expect(ReturnsPage()).rejects.toThrow("REDIRECT:/login");
    await expect(VouchersPage({ searchParams: Promise.resolve({}) } as never)).rejects.toThrow("REDIRECT:/login");
  });
});

describe("la vendedora con la sesión de la caja", () => {
  it("busca la venta, la cotiza y devuelve a vale: todo con la ubicación de su sesión y respuestas en JSON puro", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }]);
    await asSeller();
    const a = await actions();

    const search = await a.searchReturnSalesAction(sale.number.slice(-4));
    expect(search).toMatchObject({ ok: true });
    if (!search.ok) throw new Error("no");
    expect(search.sales.map((s) => s.id)).toEqual([sale.saleId]);
    isPlainJson(search);

    const detail = await a.getReturnSaleAction(sale.saleId);
    expect(detail).toMatchObject({ ok: true, sale: { number: sale.number, paidWithVoucher: false, outOfWindow: false } });
    isPlainJson(detail);

    const quote = await a.quoteReturnAction({ saleId: sale.saleId, lines: saleLines(sale), resolution: { kind: "VALE" } });
    expect(quote).toMatchObject({ ok: true, quote: { valueReturned: 8_990, approval: { required: false } } });
    isPlainJson(quote);

    const before = await stock(f.loc.TIENDA_RANCAGUA);
    const created = await a.createReturnAction({ saleId: sale.saleId, lines: saleLines(sale), resolution: { kind: "VALE" }, reason: "TALLA", idempotencyKey: newKey("dev") });
    expect(created).toMatchObject({ ok: true });
    if (!created.ok) throw new Error("no");
    expect(created.number).toMatch(/^DEV-\d{6}$/);
    expect(await stock(f.loc.TIENDA_RANCAGUA)).toBe(before + 1);
    const row = await db.return.findUniqueOrThrow({ where: { id: created.returnId } });
    expect(row).toMatchObject({ locationId: f.loc.TIENDA_RANCAGUA, userId: f.actors.vendRga.id });
    await expectInvariants();
  });

  it("la ubicación NO sale del navegador: un locationId en el payload se ignora y una cookie de ubicación ajena no la mueve", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }]);
    await asSeller();
    mocks.jar[LOCATION_COOKIE] = f.loc.BODEGA; // la vendedora no elige ubicación: es la suya
    const a = await actions();
    const created = await a.createReturnAction({
      locationId: f.loc.BODEGA,
      saleId: sale.saleId,
      lines: saleLines(sale),
      resolution: { kind: "VALE" },
      reason: "TALLA",
      idempotencyKey: newKey("dev"),
    });
    expect(created).toMatchObject({ ok: true });
    if (!created.ok) throw new Error("no");
    expect((await db.return.findUniqueOrThrow({ where: { id: created.returnId } })).locationId).toBe(f.loc.TIENDA_RANCAGUA);
    expect(await stockOf(await f.variant(PBA_XL), f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 0 }); // la bodega no se tocó
  });

  it("el reembolso en dinero: sin aprobación se bloquea; pide la aprobación, Belén aprueba y se ejecuta con ella; la administradora no la pide", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }], { method: "EFECTIVO" });
    await asSeller();
    const a = await actions();
    const resolution = { kind: "DINERO" as const, method: "EFECTIVO" as const };
    const base = { saleId: sale.saleId, lines: saleLines(sale), resolution, reason: "FALLA", reasonNote: "Se descosió" };

    expect(await a.createReturnAction({ ...base, idempotencyKey: newKey("dev") })).toMatchObject({ ok: false, code: "APROBACION_REQUERIDA" });
    const asked = await a.requestReturnApprovalAction({ ...base, idempotencyKey: newKey("sol") });
    expect(asked).toMatchObject({ ok: true, approval: { status: "PENDIENTE", amount: 8_990 } });
    if (!asked.ok) throw new Error("no");
    isPlainJson(asked);
    expect(await a.createReturnAction({ ...base, approvalId: asked.approval.id, idempotencyKey: newKey("dev") })).toMatchObject({ ok: false, code: "APROBACION_REQUERIDA" }); // Belén todavía no responde

    await approveRequest({ actor: f.actors.belen, requestId: asked.approval.id, idempotencyKey: newKey("ap") });
    const ok = await a.createReturnAction({ ...base, approvalId: asked.approval.id, idempotencyKey: newKey("dev") });
    expect(ok).toMatchObject({ ok: true });
    expect((await db.approvalRequest.findUniqueOrThrow({ where: { id: asked.approval.id } })).status).toBe("USADA");

    reset();
    await asAdmin(f.loc.TIENDA_RANCAGUA);
    expect(await a.requestReturnApprovalAction({ ...base, idempotencyKey: newKey("sol") })).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("un cambio por la acción: devuelve, se lleva otra prenda y paga la diferencia", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await asSeller();
    const a = await actions();
    const created = await a.createReturnAction({
      saleId: sale.saleId,
      lines: saleLines(sale),
      resolution: { kind: "CAMBIO", newLines: [{ variantId: await f.variant("JMT012-AZU-48"), qty: 1 }], payment: { method: "DEBITO", reference: "V-1" } },
      reason: "TALLA",
      idempotencyKey: newKey("cambio"),
    });
    expect(created).toMatchObject({ ok: true });
    expect(await db.sale.count()).toBe(2);
  });

  it("consulta un vale por código (JSON puro) y a los 10 códigos incorrectos queda bloqueada", async () => {
    await asSeller();
    const a = await actions();
    const v = await insertVoucher(f, { code: "VAL-ACTI-ONES-0001", amount: 12_000 });
    const found = await a.lookupVoucherAction(v.code.toLowerCase());
    expect(found).toMatchObject({ ok: true, voucher: { balance: 12_000, status: "VIGENTE" } });
    isPlainJson(found);
    for (let i = 0; i < 10; i++) expect(await a.lookupVoucherAction("VAL-ZZZZ-ZZZZ-ZZZZ")).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await a.lookupVoucherAction(v.code)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("no puede desactivar vales (acción de Belén)", async () => {
    await asSeller();
    const vales = await import("@/app/(app)/vales/actions");
    const v = await insertVoucher(f, { code: "VAL-ACTI-ONES-0002", amount: 5_000 });
    expect(await vales.deactivateVoucherAction({ voucherId: v.id, reason: "Se perdió" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).active).toBe(true);
  });
});

describe("la administradora con su sesión web", () => {
  it("sin ubicación elegida ('Operando en') no opera; en la bodega registra el pedido devuelto por courier (sin efectivo)", async () => {
    const sale = await onlineDispatchedSale();
    await asAdmin(); // sin cookie de ubicación
    const a = await actions();
    expect(await a.searchReturnSalesAction("")).toMatchObject({ ok: false, message: expect.stringMatching(/Elige una ubicación/) });

    mocks.jar[LOCATION_COOKIE] = f.loc.BODEGA;
    const lines = [{ saleLineId: sale.line[PBA_XL], qty: 1, condition: "VENDIBLE" as const }];
    expect(await a.createReturnAction({ saleId: sale.saleId, lines, resolution: { kind: "DINERO", method: "EFECTIVO" }, reason: "ARREPENTIMIENTO", idempotencyKey: newKey("d") })).toMatchObject({ ok: false, message: expect.stringMatching(/no tiene caja/) });
    // en la bodega no hay cambios (antes de devolver la línea, para que el rechazo sea por la ubicación)
    expect(
      await a.quoteReturnAction({ saleId: sale.saleId, lines, resolution: { kind: "CAMBIO", newLines: [{ variantId: await f.variant("JMT012-AZU-48"), qty: 1 }] } }),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/no vende al público/) });
    const bodegaBefore = await stock(f.loc.BODEGA);
    const created = await a.createReturnAction({
      saleId: sale.saleId,
      lines,
      resolution: { kind: "DINERO", method: "TRANSFERENCIA", reference: "TRF-77" },
      reason: "ARREPENTIMIENTO",
      idempotencyKey: newKey("d"),
    });
    expect(created).toMatchObject({ ok: true });
    if (!created.ok) throw new Error("no");
    const row = await db.return.findUniqueOrThrow({ where: { id: created.returnId } });
    expect(row).toMatchObject({ locationId: f.loc.BODEGA, refundMethod: "TRANSFERENCIA", refundAmount: 8_990, approvalId: null });
    expect(await stock(f.loc.BODEGA)).toBe(bodegaBefore + 1);
  });

  it("desactiva un vale (queda en audit_log) y el vale ya no se canjea", async () => {
    await asAdmin(f.loc.TIENDA_RANCAGUA);
    const vales = await import("@/app/(app)/vales/actions");
    const v = await insertVoucher(f, { code: "VAL-ACTI-ONES-0003", amount: 5_000 });
    expect(await vales.deactivateVoucherAction({ voucherId: v.id, reason: "La clienta lo perdió" })).toEqual({ ok: true });
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).active).toBe(false);
    expect(await db.auditLog.count({ where: { action: "VOUCHER_DEACTIVATE", entityId: v.id } })).toBe(1);
    expect(await vales.deactivateVoucherAction({ voucherId: v.id, reason: "otra vez" })).toMatchObject({ ok: false, code: "CONFLICT" });
  });
});

describe("el rol BODEGA no tiene devoluciones", () => {
  it("todas las acciones lo rechazan con FORBIDDEN", async () => {
    const u = await createWebUser({ role: "BODEGA", locationId: f.loc.BODEGA });
    const { session } = await loginWithPassword({ email: u.email, password: u.password });
    mocks.jar[SESSION_COOKIE] = session.token;
    const a = await actions();
    expect(await a.searchReturnSalesAction("")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await a.getReturnSaleAction("x")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await a.lookupVoucherAction("VAL-AAAA-BBBB-CCCC")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const { default: ReturnsPage } = await import("@/app/(app)/pos/devoluciones/page");
    await expect(ReturnsPage()).rejects.toThrow("REDIRECT:/sin-acceso");
  });
});

describe("sesión de caja vencida a mitad de una devolución", () => {
  it("responde UNAUTHENTICATED, y al volver a entrar con el PIN el mismo intento (misma clave) no duplica nada", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }]);
    const { token, deviceToken, pin } = await asSeller();
    const a = await actions();
    const payload = { saleId: sale.saleId, lines: saleLines(sale), resolution: { kind: "VALE" as const }, reason: "TALLA", idempotencyKey: newKey("dev") };

    await ageSession(token, { idleMinutes: 61 }); // 60 min de inactividad en la caja (ADR-020)
    expect(await a.createReturnAction(payload)).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    expect(await db.return.count()).toBe(0); // no se perdió ni se hizo nada

    const { session } = await loginWithPin({ deviceToken, userId: f.actors.vendRga.id, pin });
    mocks.jar[SESSION_COOKIE] = session.token;
    const first = await a.createReturnAction(payload);
    const second = await a.createReturnAction(payload); // el reintento del navegador, con la MISMA clave
    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    if (!first.ok || !second.ok) throw new Error("no");
    expect(second.returnId).toBe(first.returnId);
    expect(await db.return.count()).toBe(1);
    expect(await db.voucher.count()).toBe(1);
  });
});

describe("páginas con sesión real", () => {
  it("Cambio / Devolución: la vendedora entra; el comprobante de otra ubicación la manda a /sin-acceso", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }]);
    const { createReturn } = await import("@/modules/returns");
    const mine = (await createReturn({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, saleId: sale.saleId, lines: saleLines(sale), reason: "TALLA", resolution: { kind: "VALE" }, idempotencyKey: newKey("d") })).result;
    const bodega = (await createReturn({ actor: f.actors.belen, locationId: f.loc.BODEGA, saleId: sale.saleId, lines: saleLines(sale), reason: "TALLA", resolution: { kind: "VALE" }, idempotencyKey: newKey("d") })).result;
    await asSeller();
    const { default: ReturnsPage } = await import("@/app/(app)/pos/devoluciones/page");
    const { default: Receipt } = await import("@/app/(app)/pos/devoluciones/[id]/page");
    await expect(ReturnsPage()).resolves.toBeDefined();
    await expect(Receipt({ params: Promise.resolve({ id: mine.id }) } as never)).resolves.toBeDefined();
    await expect(Receipt({ params: Promise.resolve({ id: bodega.id }) } as never)).rejects.toThrow("REDIRECT:/sin-acceso");
    await expect(Receipt({ params: Promise.resolve({ id: "no-existe" }) } as never)).rejects.toThrow("NOT_FOUND");
  });

  it("Vales y el reporte de Devoluciones son solo de la administradora", async () => {
    const { default: VouchersPage } = await import("@/app/(app)/vales/page");
    const { default: ReportsPage } = await import("@/app/(app)/reportes/page");
    await asSeller();
    await expect(VouchersPage({ searchParams: Promise.resolve({}) } as never)).rejects.toThrow("REDIRECT:/sin-acceso");
    await expect(ReportsPage({ searchParams: Promise.resolve({ tab: "devoluciones" }) } as never)).rejects.toThrow("REDIRECT:/sin-acceso");
    reset();
    await asAdmin(f.loc.TIENDA_RANCAGUA);
    await expect(VouchersPage({ searchParams: Promise.resolve({ estado: "TODOS" }) } as never)).resolves.toBeDefined();
    await expect(ReportsPage({ searchParams: Promise.resolve({ tab: "devoluciones" }) } as never)).resolves.toBeDefined();
  });
});
