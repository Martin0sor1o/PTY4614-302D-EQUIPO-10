import { db } from "@/lib/db";
import type { Actor } from "@/lib/access";
import { approveRequest } from "@/modules/approvals";
import { createReturn, requestReturnApproval, type CreateReturnInput, type ReturnLineInput, type ReturnResolutionInput } from "@/modules/returns";
import { createSale, getCashClosingTotals, openCashSession, closeCashSession } from "@/modules/sales";
import { newKey, type Fixtures } from "./helpers";

// Utilidades de los tests de devoluciones y vales (solo usan la API pública de los módulos y Prisma para verificar).

export const PBA_XL = "PBA041-NEG-XL"; // $8.990 · Rancagua 5 · Bodega 20
export const JMT_AZU = "JMT012-AZU-48"; // $29.990 · Rancagua 1 · Bodega 8
export const JMT_NEG = "JMT012-NEG-48"; // $29.990 · Rancagua 0 · Bodega 6
export const BLM_BUR = "BLM022-BUR-3XL"; // Rancagua 0 · Bodega 5

export const openCaja = (f: Fixtures, openingCash = 50_000) =>
  openCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, openingCash });

export const closeCajaExact = async (f: Fixtures, sessionId: string) =>
  closeCashSession({
    actor: f.actors.vendRga,
    locationId: f.loc.TIENDA_RANCAGUA,
    countedCash: (await getCashClosingTotals(f.actors.vendRga, sessionId)).expectedCash,
  });

export type SaleSpec = { sku: string; qty?: number; discountBps?: number };

export interface SoldSale {
  saleId: string;
  number: string;
  total: number;
  /** saleLineId por SKU */
  line: Record<string, string>;
}

/** Venta POS en la tienda (por defecto la vendedora, con tarjeta). Requiere caja abierta. */
export async function sellPos(
  f: Fixtures,
  specs: SaleSpec[],
  opts: { actor?: Actor; method?: "DEBITO" | "EFECTIVO" | "TRANSFERENCIA"; voucherCode?: string; key?: string } = {},
): Promise<SoldSale> {
  const lines = await Promise.all(specs.map(async (s) => ({ variantId: await f.variant(s.sku), qty: s.qty ?? 1, discountBps: s.discountBps ?? 0 })));
  const method = opts.method ?? "DEBITO";
  const { result } = await createSale({
    actor: opts.actor ?? f.actors.vendRga,
    locationId: f.loc.TIENDA_RANCAGUA,
    lines,
    payment: method === "EFECTIVO" ? { method, cashReceived: 500_000 } : { method, reference: "V-7001" },
    voucherCode: opts.voucherCode,
    idempotencyKey: opts.key ?? newKey("venta"),
  });
  return { saleId: result.id, number: result.number, total: result.total, line: await lineIds(f, result.id, specs.map((s) => s.sku)) };
}

export async function lineIds(f: Fixtures, saleId: string, skus: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const sku of skus) {
    const variantId = await f.variant(sku);
    out[sku] = (await db.saleLine.findFirstOrThrow({ where: { saleId, variantId } })).id;
  }
  return out;
}

export type ReturnSpec = { sku: string; qty?: number; condition?: "VENDIBLE" | "DANADA" };

export const toLines = (sale: SoldSale, specs: ReturnSpec[]): ReturnLineInput[] =>
  specs.map((s) => ({ saleLineId: sale.line[s.sku], qty: s.qty ?? 1, condition: s.condition ?? "VENDIBLE" }));

export const VALE: ReturnResolutionInput = { kind: "VALE" };
export const DINERO_EFECTIVO: ReturnResolutionInput = { kind: "DINERO", method: "EFECTIVO" };
export const DINERO_TRANSFERENCIA: ReturnResolutionInput = { kind: "DINERO", method: "TRANSFERENCIA", reference: "TRF-9001" };
export const cambio = async (
  f: Fixtures,
  newSpecs: { sku: string; qty?: number }[],
  payment?: Extract<ReturnResolutionInput, { kind: "CAMBIO" }>["payment"],
): Promise<ReturnResolutionInput> => ({
  kind: "CAMBIO",
  newLines: await Promise.all(newSpecs.map(async (s) => ({ variantId: await f.variant(s.sku), qty: s.qty ?? 1 }))),
  payment,
});

export interface DoReturnOpts {
  actor?: Actor;
  locationId?: string;
  reason?: CreateReturnInput["reason"];
  reasonNote?: string;
  approvalId?: string;
  key?: string;
}

export function doReturn(f: Fixtures, sale: SoldSale, specs: ReturnSpec[], resolution: ReturnResolutionInput, opts: DoReturnOpts = {}) {
  return createReturn({
    actor: opts.actor ?? f.actors.vendRga,
    locationId: opts.locationId ?? f.loc.TIENDA_RANCAGUA,
    saleId: sale.saleId,
    lines: toLines(sale, specs),
    reason: opts.reason ?? "TALLA",
    reasonNote: opts.reasonNote,
    resolution,
    approvalId: opts.approvalId,
    idempotencyKey: opts.key ?? newKey("devolucion"),
  });
}

/** La vendedora pide la aprobación de esta devolución y Belén la aprueba: devuelve el approvalId listo para usar. */
export async function approvedReturn(f: Fixtures, sale: SoldSale, specs: ReturnSpec[], resolution: ReturnResolutionInput, reason: CreateReturnInput["reason"] = "TALLA") {
  const { result } = await requestReturnApproval({
    actor: f.actors.vendRga,
    locationId: f.loc.TIENDA_RANCAGUA,
    saleId: sale.saleId,
    lines: toLines(sale, specs),
    resolution,
    reason,
    idempotencyKey: newKey("sol-devolucion"),
  });
  await approveRequest({ actor: f.actors.belen, requestId: result.id, idempotencyKey: newKey("aprobar") });
  return result.id;
}

/** Cambia las fechas de una venta para probar el plazo (la venta no es inmutable). */
export const ageSale = (saleId: string, days: number) =>
  db.sale.update({ where: { id: saleId }, data: { createdAt: new Date(Date.now() - days * 86_400_000) } });

export const setSetting = (key: string, valueInt: number) =>
  db.setting.upsert({ where: { key }, update: { valueInt }, create: { key, valueInt, description: `test ${key}`, isDemoValue: true } });

/** Inserta un vale directamente (con movimiento de emisión): permite fechas de vencimiento pasadas, que issueVoucher no genera. */
export async function insertVoucher(
  f: Fixtures,
  opts: { code: string; amount: number; balance?: number; expiresAt?: Date; active?: boolean },
) {
  const v = await db.voucher.create({
    data: {
      code: opts.code,
      issuedLocationId: f.loc.TIENDA_RANCAGUA,
      initialAmount: opts.amount,
      balance: opts.balance ?? opts.amount,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 30 * 86_400_000),
      active: opts.active ?? true,
      createdBy: f.actors.belen.id,
    },
  });
  await db.voucherMovement.create({
    data: { voucherId: v.id, type: "EMISION", amount: opts.amount, balanceAfter: opts.amount, refType: "RETURN", refId: "test", userId: f.actors.belen.id, idempotencyKey: newKey("emision") },
  });
  if (opts.balance !== undefined && opts.balance < opts.amount) {
    await db.voucherMovement.create({
      data: { voucherId: v.id, type: "CANJE", amount: opts.balance - opts.amount, balanceAfter: opts.balance, refType: "SALE", refId: "test", userId: f.actors.belen.id, idempotencyKey: newKey("canje") },
    });
  }
  return v;
}
