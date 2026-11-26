import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { PAIRING_UNAVAILABLE_IN_DEMO } from "@/modules/auth/pos-devices";
import { findVoucherLedgerMismatches } from "@/modules/vouchers";
import { expectInvariants, newKey, resetDemo, type Fixtures } from "./helpers";
import { lineIds, PBA_XL } from "./returns-helpers";

// Los flujos de la demo COMO EN RENDER: Server Actions con la cookie de "Entrar como…" (sin contraseña) y SIN AUTH_SECRET.
// Los demás tests de acciones entran con el login real, que sí exige el secreto; por eso este archivo lo quita también en el
// perfil por omisión: es la red que habría detectado que el canje de vales no funcionaba en la demo.

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
const errorLog = vi.fn();
beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", ""); // la demo no lo tiene
  vi.stubEnv("DEMO_MODE", "true");
  f = await resetDemo();
  for (const k of Object.keys(mocks.jar)) delete mocks.jar[k];
  errorLog.mockReset();
  vi.spyOn(console, "error").mockImplementation(errorLog);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** "Entrar como…": igual que el botón de la pantalla de acceso de la demo. Con `operatingIn`, elige "Operando en". */
async function enterAs(userId: string, operatingIn?: string) {
  for (const k of Object.keys(mocks.jar)) delete mocks.jar[k];
  const { demoLoginAction } = await import("@/app/login/actions");
  const form = new FormData();
  form.set("userId", userId);
  await expect(demoLoginAction(form)).rejects.toThrow("REDIRECT:/");
  if (operatingIn) {
    const { setActiveLocation } = await import("@/modules/auth");
    await setActiveLocation(operatingIn);
  }
}
const asSeller = () => enterAs(f.actors.vendRga.id);
const asBelen = () => enterAs(f.actors.belen.id, f.loc.TIENDA_RANCAGUA);

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};

async function openRegister() {
  const { openCashAction } = await import("@/app/(app)/pos/actions");
  await expect(openCashAction(undefined, form({ openingCash: "50000" }))).rejects.toThrow("REDIRECT:/pos");
}

/** Venta con tarjeta desde la caja. Devuelve la venta y su línea. */
async function sell(extra: Record<string, unknown> = {}, qty = 1) {
  const { createSaleAction } = await import("@/app/(app)/pos/actions");
  const res = await createSaleAction({
    lines: [{ variantId: await f.variant(PBA_XL), qty, discountBps: 0 }],
    payment: { method: "DEBITO", reference: "V-1" },
    idempotencyKey: newKey("venta"),
    ...extra,
  });
  if (!res.ok) throw new Error(`venta rechazada: ${res.message}`);
  return { saleId: res.saleId, lineId: (await lineIds(f, res.saleId, [PBA_XL]))[PBA_XL] };
}

describe("demo sin AUTH_SECRET: los flujos nuevos por las Server Actions", () => {
  it("devolución con reembolso en efectivo: la vendedora la pide, Belén la aprueba desde su sesión y se confirma", async () => {
    await asSeller();
    await openRegister();
    const sale = await sell();
    const returns = await import("@/app/(app)/pos/devoluciones/actions");
    const base = { saleId: sale.saleId, lines: [{ saleLineId: sale.lineId, qty: 1, condition: "VENDIBLE" as const }], resolution: { kind: "DINERO" as const, method: "EFECTIVO" as const }, reason: "TALLA" };

    const asked = await returns.requestReturnApprovalAction({ ...base, idempotencyKey: newKey("sol") });
    if (!asked.ok) throw new Error(asked.message);

    await asBelen();
    const { approveAction } = await import("@/app/(app)/aprobaciones/actions");
    expect(await approveAction({ requestId: asked.approval.id, idempotencyKey: newKey("ap") })).toMatchObject({ ok: true });
    const { default: ApprovalsPage } = await import("@/app/(app)/aprobaciones/page");
    await expect(ApprovalsPage()).resolves.toBeDefined();

    await asSeller();
    expect(await returns.createReturnAction({ ...base, approvalId: asked.approval.id, idempotencyKey: newKey("dev") })).toMatchObject({ ok: true });
    await expectInvariants();
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("devolución a vale → canje del vale en el cobro → cambio → cierre de caja cuadrado → Vales, reporte y desactivar", async () => {
    await asSeller();
    await openRegister();
    const first = await sell({}, 2);
    const returns = await import("@/app/(app)/pos/devoluciones/actions");

    const toVoucher = await returns.createReturnAction({
      saleId: first.saleId,
      lines: [{ saleLineId: first.lineId, qty: 1, condition: "VENDIBLE" }],
      resolution: { kind: "VALE" },
      reason: "TALLA",
      idempotencyKey: newKey("dev"),
    });
    if (!toVoucher.ok) throw new Error(toVoucher.message);
    const voucher = await db.voucher.findFirstOrThrow({ where: { balance: { gt: 0 } }, orderBy: { createdAt: "desc" } });

    // El código escrito como lo teclea una persona: minúsculas y espacios en vez de guiones. Aquí fallaba la demo.
    const typed = voucher.code.toLowerCase().replaceAll("-", " ");
    expect(await returns.lookupVoucherAction(typed)).toMatchObject({ ok: true, voucher: { balance: 8_990, status: "VIGENTE" } });
    const redeemed = await sell({ voucherCode: typed, payment: undefined });
    expect((await db.voucher.findUniqueOrThrow({ where: { id: voucher.id } })).balance).toBe(0);
    expect(await db.payment.count({ where: { saleId: redeemed.saleId, method: "VALE" } })).toBe(1);

    const exchange = await returns.createReturnAction({
      saleId: first.saleId,
      lines: [{ saleLineId: first.lineId, qty: 1, condition: "VENDIBLE" }],
      resolution: { kind: "CAMBIO", newLines: [{ variantId: await f.variant("JMT012-AZU-48"), qty: 1 }], payment: { method: "EFECTIVO", cashReceived: 50_000 } },
      reason: "TALLA",
      idempotencyKey: newKey("cambio"),
    });
    if (!exchange.ok) throw new Error(exchange.message);

    const session = await db.cashSession.findFirstOrThrow({ where: { status: "ABIERTA" } });
    const { getCashClosingTotals } = await import("@/modules/sales");
    const totals = await getCashClosingTotals(f.actors.vendRga, session.id);
    // Emitidos: solo lo que quedó en manos de la clienta (la devolución a vale; este cambio no dejó saldo a favor).
    // Canjeados: el cobro con vale MÁS el crédito interno del cambio. Los vales no mueven efectivo.
    expect(totals).toMatchObject({ vouchersIssued: 8_990, vouchersRedeemed: 2 * 8_990 });
    const { closeCashAction } = await import("@/app/(app)/pos/actions");
    await expect(closeCashAction(undefined, form({ countedCash: String(totals.expectedCash), notes: "" }))).rejects.toThrow(`REDIRECT:/pos/caja?cerrada=${session.id}`);
    expect((await db.cashSession.findUniqueOrThrow({ where: { id: session.id } })).difference).toBe(0);
    const { default: CashPage } = await import("@/app/(app)/pos/caja/page");
    await expect(CashPage({ searchParams: Promise.resolve({ cerrada: session.id }) } as never)).resolves.toBeDefined();

    // Acceso cruzado con sesión demo: la vendedora no desactiva vales.
    await asSeller();
    const { deactivateVoucherAction } = await import("@/app/(app)/vales/actions");
    expect(await deactivateVoucherAction({ voucherId: voucher.id, reason: "No me corresponde" })).toMatchObject({ ok: false, code: "FORBIDDEN" });

    await asBelen();
    const { default: VouchersPage } = await import("@/app/(app)/vales/page");
    await expect(VouchersPage({ searchParams: Promise.resolve({ estado: "TODOS", vale: voucher.id }) } as never)).resolves.toBeDefined();
    const { default: ReportsPage } = await import("@/app/(app)/reportes/page");
    for (const tab of ["ventas", "devoluciones"]) await expect(ReportsPage({ searchParams: Promise.resolve({ tab }) } as never)).resolves.toBeDefined();

    const spare = await db.voucher.findFirst({ where: { balance: { gt: 0 }, active: true } });
    if (spare) {
      expect(await deactivateVoucherAction({ voucherId: spare.id, reason: "La clienta lo perdió" })).toEqual({ ok: true });
    }
    expect(await findVoucherLedgerMismatches()).toEqual([]);
    await expectInvariants();
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("\"Reiniciar datos de demo\" funciona sin el secreto", async () => {
    await asBelen();
    const { resetDemoDataAction } = await import("@/app/(app)/demo-actions");
    await expect(resetDemoDataAction()).rejects.toThrow("REDIRECT:/login?reiniciado=1");
    expect(await db.voucher.count({ where: { balance: { gt: 0 } } })).toBeGreaterThan(0); // el seed deja un vale vigente
    expect(errorLog).not.toHaveBeenCalled();
  }, 120_000);

  it("vincular equipos (login real) se rechaza con un mensaje claro, sin error inesperado ni intentos consumidos", async () => {
    await asBelen();
    const { createPairingAction } = await import("@/app/(app)/ajustes/actions");
    expect(await createPairingAction({ locationId: f.loc.TIENDA_RANCAGUA, name: "Caja" })).toMatchObject({ ok: false, message: PAIRING_UNAVAILABLE_IN_DEMO });

    for (const k of Object.keys(mocks.jar)) delete mocks.jar[k]; // /vincular es pública: sin sesión
    const { linkDeviceAction } = await import("@/app/vincular/actions");
    expect(await linkDeviceAction({ code: "ABCD-EFGH" })).toMatchObject({ ok: false, message: PAIRING_UNAVAILABLE_IN_DEMO });
    expect(await db.posDevice.count()).toBe(0);
    expect(await db.authThrottle.count()).toBe(0);
    expect(errorLog).not.toHaveBeenCalled();
  });
});
