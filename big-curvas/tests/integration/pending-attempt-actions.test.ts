import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";
import { db } from "@/lib/db";
import { createAttemptController, OTHER_USER_MESSAGE, type AttemptStorage, type AttemptSummary, type LookupResult, type SendResult } from "@/lib/pending-attempt";
import { findReturnByAttemptKey } from "@/modules/returns";
import { findSaleByAttemptKey, getCashClosingTotals } from "@/modules/sales";
import { createExtraStore, expectAppError, expectInvariants, resetDemo, stockOf, type Fixtures } from "./helpers";
import { cambio, DINERO_EFECTIVO, doReturn, insertVoucher, JMT_AZU, openCaja, PBA_XL, sellPos, toLines, VALE, type SoldSale } from "./returns-helpers";
import type { ReturnResolutionInput } from "@/modules/returns";

// Reintentar sin duplicar: las MISMAS Server Actions que usa la caja, entrando como en la demo ("Entrar como…", sin
// AUTH_SECRET), contra Postgres real.

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
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const VOUCHER = "VAL-C7KM-4QRT-9XWZ";
const consoleLines: string[] = [];

let f: Fixtures;
beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", ""); // la demo no lo tiene
  vi.stubEnv("DEMO_MODE", "true");
  f = await resetDemo();
  for (const k of Object.keys(mocks.jar)) delete mocks.jar[k];
  consoleLines.length = 0;
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void consoleLines.push(args.map(String).join(" ")));
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function enterAs(userId: string) {
  for (const k of Object.keys(mocks.jar)) delete mocks.jar[k];
  const { demoLoginAction } = await import("@/app/login/actions");
  const form = new FormData();
  form.set("userId", userId);
  await expect(demoLoginAction(form)).rejects.toThrow("REDIRECT:/");
}

const actions = async () => ({
  ...(await import("@/app/(app)/pos/actions")),
  ...(await import("@/app/(app)/pos/devoluciones/actions")),
});

const store = () => f.loc.TIENDA_RANCAGUA;

const salePayload = async (extra: Record<string, unknown> = {}) => ({
  lines: [{ variantId: await f.variant(PBA_XL), qty: 1, discountBps: 0 }],
  payment: { method: "EFECTIVO", cashReceived: 10_000 },
  idempotencyKey: randomUUID(),
  ...extra,
});

const returnPayload = (sale: SoldSale, resolution: ReturnResolutionInput) => ({
  saleId: sale.saleId,
  lines: toLines(sale, [{ sku: PBA_XL }]),
  reason: "TALLA",
  resolution,
  idempotencyKey: randomUUID(),
});

const snapshot = async () => ({
  sales: await db.sale.count(),
  payments: await db.payment.count(),
  returns: await db.return.count(),
  vouchers: await db.voucher.count(),
  movements: await db.inventoryMovement.count(),
  audit: await db.auditLog.count(),
});

describe("cobro: la misma clave dos veces", () => {
  it("una sola venta, un solo descuento de stock, un solo pago en caja y la misma respuesta", async () => {
    const session = await openCaja(f);
    await enterAs(f.actors.vendRga.id);
    const { createSaleAction } = await actions();
    const variantId = await f.variant(PBA_XL);
    const before = await stockOf(variantId, store());
    const payload = await salePayload();

    const first = await createSaleAction(payload);
    const second = await createSaleAction({ ...payload, retryOfUserId: f.actors.vendRga.id });

    expect(first).toMatchObject({ ok: true });
    expect(second).toEqual(first);
    expect(await db.sale.count()).toBe(1);
    expect(await db.payment.count()).toBe(1);
    expect(await db.inventoryMovement.count({ where: { type: "VENTA_POS" } })).toBe(1);
    expect((await stockOf(variantId, store())).onHand).toBe(before.onHand - 1);
    expect(await getCashClosingTotals(f.actors.vendRga, session.id)).toMatchObject({ salesCount: 1, cashCollected: 8_990, expectedCash: 58_990 });
    await expectInvariants();
  });
});

describe("devolución y cambio: la misma clave dos veces", () => {
  async function twice(resolution: ReturnResolutionInput) {
    await enterAs(f.actors.belen.id);
    const { setActiveLocation } = await import("@/modules/auth");
    await setActiveLocation(store());
    const { createReturnAction } = await actions();
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }], { method: "EFECTIVO" });
    const payload = returnPayload(sale, resolution);
    const first = await createReturnAction(payload);
    const second = await createReturnAction({ ...payload, retryOfUserId: f.actors.belen.id });
    expect(first).toMatchObject({ ok: true });
    expect(second).toEqual(first);
    return sale;
  }

  it("devolución en efectivo: una sola devolución, un solo ingreso de stock y el efectivo sale una vez", async () => {
    const session = await openCaja(f);
    const sale = await twice(DINERO_EFECTIVO);
    expect(await db.return.count()).toBe(1);
    expect(await db.inventoryMovement.count({ where: { refType: "RETURN" } })).toBe(1);
    expect((await db.saleLine.findFirstOrThrow({ where: { id: sale.line[PBA_XL] } })).returnedQuantity).toBe(1);
    // $50.000 de fondo + $17.980 cobrados − $8.990 devueltos una sola vez.
    expect(await getCashClosingTotals(f.actors.vendRga, session.id)).toMatchObject({ cashReturned: 8_990, expectedCash: 58_990 });
    await expectInvariants();
  });

  it("devolución a vale: se emite un solo vale", async () => {
    await openCaja(f);
    await twice(VALE);
    expect(await db.return.count()).toBe(1);
    expect(await db.voucher.count()).toBe(1);
    await expectInvariants();
  });

  it("cambio: una sola venta nueva, un solo descuento de la prenda nueva y un solo pago", async () => {
    const session = await openCaja(f);
    const variantId = await f.variant(JMT_AZU);
    const before = await stockOf(variantId, store());
    await twice(await cambio(f, [{ sku: JMT_AZU }], { method: "EFECTIVO", cashReceived: 21_000 }));
    expect(await db.return.count()).toBe(1);
    expect(await db.sale.count()).toBe(2); // la original y la del cambio
    expect(await db.payment.count({ where: { method: "EFECTIVO" } })).toBe(2);
    expect((await stockOf(variantId, store())).onHand).toBe(before.onHand - 1);
    expect(await getCashClosingTotals(f.actors.vendRga, session.id)).toMatchObject({ cashCollected: 38_980, expectedCash: 88_980 });
    await expectInvariants();
  });
});

describe("respuesta perdida de punta a punta (la caja y las acciones reales)", () => {
  const memory = (): AttemptStorage => {
    const map = new Map<string, string>();
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
      key: (i) => [...map.keys()][i] ?? null,
      get length() {
        return map.size;
      },
    };
  };
  const summary: AttemptSummary = { operation: "venta", amountLabel: "Total", amount: 8_990, lines: [], payment: "Efectivo" };

  async function till(storage: AttemptStorage, loseResponses: number) {
    const { createSaleAction, checkSaleAttemptAction } = await actions();
    let lose = loseResponses;
    const done = vi.fn();
    const controller = createAttemptController<Record<string, unknown>>({
      slot: "venta:Tienda Rancagua",
      storage,
      onDone: done,
      send: async (payload, idempotencyKey, retryOfUserId): Promise<SendResult> => {
        const res = await createSaleAction({ ...payload, idempotencyKey, retryOfUserId });
        if (lose-- > 0) throw new TypeError("Failed to fetch"); // el servidor YA guardó; la respuesta no llega
        return res.ok ? { ok: true, id: res.saleId, number: res.number } : res;
      },
      lookup: async (key): Promise<LookupResult> => checkSaleAttemptAction(key),
    });
    controller.load();
    return { controller, done };
  }

  async function lostSale(storage: AttemptStorage) {
    await openCaja(f);
    await enterAs(f.actors.vendRga.id);
    const payload: Record<string, unknown> = await salePayload();
    delete payload.idempotencyKey;
    const first = await till(storage, 1);
    expect(await first.controller.submit({ content: payload, payload, summary, userId: f.actors.vendRga.id })).toEqual({ status: "en_duda" });
    expect(await db.sale.count()).toBe(1); // quedó registrada aunque la caja no se enteró
  }

  it("recargar y “Reintentar” muestra la MISMA venta: nunca hay un segundo cobro", async () => {
    const storage = memory();
    await lostSale(storage);
    const reloaded = await till(storage, 0);
    await reloaded.controller.retry(f.actors.vendRga.id);

    const sale = await db.sale.findFirstOrThrow();
    expect(reloaded.done).toHaveBeenCalledExactlyOnceWith({ ok: true, id: sale.id, number: sale.number });
    expect(await db.sale.count()).toBe(1);
    expect(await db.payment.count()).toBe(1);
    expect(await db.inventoryMovement.count({ where: { type: "VENTA_POS" } })).toBe(1);
  });

  it("recargar y “Verificar” encuentra la venta sin escribir nada", async () => {
    const storage = memory();
    await lostSale(storage);
    const reloaded = await till(storage, 0);
    const before = await snapshot();
    await reloaded.controller.verify();

    const sale = await db.sale.findFirstOrThrow();
    expect(reloaded.done).toHaveBeenCalledExactlyOnceWith({ id: sale.id, number: sale.number });
    expect(await snapshot()).toEqual(before);
    expect(storage.length).toBe(0);
  });
});

describe("reintento de otra persona", () => {
  it("el servidor lo rechaza y no registra nada", async () => {
    await openCaja(f);
    await enterAs(f.actors.vendRga2.id);
    const { createSaleAction, createReturnAction } = await actions();
    const before = await snapshot();
    const rejected = { ok: false, message: OTHER_USER_MESSAGE, code: "FORBIDDEN" };

    expect(await createSaleAction(await salePayload({ retryOfUserId: f.actors.vendRga.id }))).toEqual(rejected);
    expect(await createReturnAction({ saleId: "x", lines: [{ saleLineId: "y", qty: 1, condition: "VENDIBLE" }], reason: "TALLA", resolution: VALE, idempotencyKey: randomUUID(), retryOfUserId: f.actors.vendRga.id })).toEqual(rejected);
    expect(await snapshot()).toEqual(before);
  });
});

describe("error inesperado del servidor", () => {
  it("cobro y devolución lo marcan como “sin confirmar”; un error de negocio, no", async () => {
    await openCaja(f);
    await enterAs(f.actors.vendRga.id);
    const { createSaleAction, createReturnAction } = await actions();

    const business = await createSaleAction(await salePayload({ payment: { method: "EFECTIVO", cashReceived: 1 } }));
    expect(business).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(business).not.toHaveProperty("uncertain", true);

    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    vi.spyOn(db, "$transaction").mockRejectedValue(new Error("se cayó la conexión"));
    expect(await createSaleAction(await salePayload())).toMatchObject({ ok: false, uncertain: true });
    expect(await createReturnAction(returnPayload(sale, VALE))).toMatchObject({ ok: false, uncertain: true });
  });
});

describe("consulta por clave: solo lectura y solo la propia ubicación", () => {
  it("venta: la encuentra en su tienda y no escribe nada", async () => {
    await openCaja(f);
    await enterAs(f.actors.vendRga.id);
    const { createSaleAction, checkSaleAttemptAction } = await actions();
    const payload = await salePayload();
    const created = await createSaleAction(payload);
    const before = await snapshot();

    expect(await checkSaleAttemptAction(payload.idempotencyKey)).toEqual({
      ok: true,
      found: { id: created.ok ? created.saleId : "", number: created.ok ? created.number : "" },
    });
    expect(await checkSaleAttemptAction(randomUUID())).toEqual({ ok: true, found: null });
    expect(await checkSaleAttemptAction("corta")).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await snapshot()).toEqual(before);
  });

  it("acceso cruzado: otra tienda, la bodega, el rol BODEGA y sin sesión no ven la venta ni la devolución", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    const saleKey = (await db.sale.findUniqueOrThrow({ where: { id: sale.saleId } })).idempotencyKey;
    const returnKey = randomUUID();
    await doReturn(f, sale, [{ sku: PBA_XL }], VALE, { key: returnKey });
    const extra = await createExtraStore();
    const other = await db.user.create({ data: { name: "Vendedora extra", email: "extra@bigcurvas.test", role: "VENDEDORA", locationId: extra.id } });
    const otherActor = { id: other.id, role: "VENDEDORA" as const, location: { id: extra.id, code: extra.code, name: "Tienda Extra", type: "STORE" as const } };

    for (const find of [
      (actor: Fixtures["actors"]["vendRga"], locationId: string, idempotencyKey: string) => findSaleByAttemptKey({ actor, locationId, idempotencyKey }),
      (actor: Fixtures["actors"]["vendRga"], locationId: string, idempotencyKey: string) => findReturnByAttemptKey({ actor, locationId, idempotencyKey }),
    ]) {
      await expectAppError(find(otherActor, store(), saleKey), "FORBIDDEN");
      await expectAppError(find(f.actors.vendRga, f.loc.BODEGA, saleKey), "FORBIDDEN");
      await expectAppError(find(f.actors.bodega, f.loc.BODEGA, saleKey), "FORBIDDEN");
    }
    // En SU ubicación, una clave de otra responde igual que una inexistente.
    expect(await findSaleByAttemptKey({ actor: otherActor, locationId: extra.id, idempotencyKey: saleKey })).toBeNull();
    expect(await findReturnByAttemptKey({ actor: otherActor, locationId: extra.id, idempotencyKey: returnKey })).toBeNull();
    expect(await findReturnByAttemptKey({ actor: f.actors.belen, locationId: f.loc.BODEGA, idempotencyKey: returnKey })).toBeNull();
    expect(await findReturnByAttemptKey({ actor: f.actors.vendRga, locationId: store(), idempotencyKey: returnKey })).toMatchObject({ number: "DEV-000001" });

    await enterAs(other.id);
    const { checkSaleAttemptAction, checkReturnAttemptAction } = await actions();
    expect(await checkSaleAttemptAction(saleKey)).toEqual({ ok: true, found: null });
    expect(await checkReturnAttemptAction(returnKey)).toEqual({ ok: true, found: null });
    await enterAs(f.actors.bodega.id);
    expect(await checkSaleAttemptAction(saleKey)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await checkReturnAttemptAction(returnKey)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    for (const k of Object.keys(mocks.jar)) delete mocks.jar[k];
    expect(await checkSaleAttemptAction(saleKey)).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    expect(await checkReturnAttemptAction(returnKey)).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
  });
});

describe("logs: ni el código del vale ni la clave de idempotencia", () => {
  it("next dev no escribe los argumentos de las Server Actions", () => {
    expect(nextConfig.logging).toMatchObject({ serverFunctions: false });
  });

  it("canje, reintento, consulta, rechazo y error inesperado no dejan el vale ni la clave en el log", async () => {
    await openCaja(f);
    await insertVoucher(f, { code: VOUCHER, amount: 100_000 });
    await enterAs(f.actors.vendRga.id);
    const { createSaleAction, checkSaleAttemptAction, lookupVoucherAction } = await actions();
    const payload = await salePayload({ voucherCode: VOUCHER, payment: undefined });

    expect(await lookupVoucherAction(VOUCHER)).toMatchObject({ ok: true });
    expect(await createSaleAction(payload)).toMatchObject({ ok: true });
    expect(await createSaleAction({ ...payload, retryOfUserId: f.actors.vendRga.id })).toMatchObject({ ok: true });
    await checkSaleAttemptAction(payload.idempotencyKey);
    await createSaleAction({ ...payload, idempotencyKey: randomUUID(), voucherCode: "VAL-ZZZZ-ZZZZ-ZZZZ" });

    // Un error inesperado cuyo mensaje arrastra el vale y la clave: queda registrado, pero limpio.
    const lostKey = randomUUID();
    vi.spyOn(db, "$transaction").mockRejectedValue(new Error(`falló la venta ${lostKey} con ${VOUCHER}; Key (idempotency_key)=(${lostKey}) already exists.`));
    expect(await createSaleAction({ ...payload, idempotencyKey: lostKey })).toMatchObject({ ok: false, uncertain: true });

    const logged = consoleLines.join("\n");
    expect(logged).toContain("[error inesperado]");
    for (const secret of [VOUCHER, VOUCHER.replace(/-/g, ""), "C7KM", "9XWZ", "ZZZZ-ZZZZ", payload.idempotencyKey, lostKey]) expect(logged).not.toContain(secret);
  });
});
