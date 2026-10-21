import { approveRequest, createApprovalRequest, rejectRequest } from "@/modules/approvals";
import { closeCashSession, createSale, getCashClosingTotals, openCashSession, requestDiscountApproval, requestVoidApproval, voidSale } from "@/modules/sales";
import { newKey, type Fixtures } from "./helpers";

// Utilidades de los tests de aprobaciones (solo usan la API pública de los módulos).

export const PBA_XL = "PBA041-NEG-XL"; // $8.990 · Rancagua 5 · Bodega 20
export const JMT_AZU = "JMT012-AZU-48"; // $29.990 · Rancagua 1
export const PIN = "2468"; // DEMO: PIN de Belén en el seed

export type CartSpec = { sku: string; qty?: number; discountBps?: number };

export async function cartLines(f: Fixtures, specs: CartSpec[]) {
  return Promise.all(specs.map(async (s) => ({ variantId: await f.variant(s.sku), qty: s.qty ?? 1, discountBps: s.discountBps ?? 0 })));
}

export const openCaja = (f: Fixtures, openingCash = 50_000) =>
  openCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, openingCash });

export async function requestDiscount(f: Fixtures, specs: CartSpec[], opts: { reason?: string; key?: string } = {}) {
  return requestDiscountApproval({
    actor: f.actors.vendRga,
    locationId: f.loc.TIENDA_RANCAGUA,
    lines: await cartLines(f, specs),
    reason: opts.reason ?? "Clienta frecuente, pidió rebaja",
    idempotencyKey: opts.key ?? newKey("solicitud"),
  });
}

export const approve = (f: Fixtures, requestId: string, key = newKey("aprobar"), comment?: string) =>
  approveRequest({ actor: f.actors.belen, requestId, comment, idempotencyKey: key });

export const reject = (f: Fixtures, requestId: string, key = newKey("rechazar"), comment?: string) =>
  rejectRequest({ actor: f.actors.belen, requestId, comment, idempotencyKey: key });

export async function sellWith(
  f: Fixtures,
  specs: CartSpec[],
  opts: { approvalId?: string; method?: "DEBITO" | "EFECTIVO"; key?: string; actor?: Fixtures["actors"]["vendRga"] } = {},
) {
  const lines = await cartLines(f, specs);
  return createSale({
    actor: opts.actor ?? f.actors.vendRga,
    locationId: f.loc.TIENDA_RANCAGUA,
    lines,
    payment: opts.method === "EFECTIVO" ? { method: "EFECTIVO", cashReceived: 100_000 } : { method: "DEBITO", reference: "V-9001" },
    approvalId: opts.approvalId,
    idempotencyKey: opts.key ?? newKey("venta"),
  });
}

/** Solicitud de anulación aprobada por Belén, lista para usar. */
export async function approvedVoid(f: Fixtures, saleId: string) {
  const { result } = await requestVoidApproval({ actor: f.actors.vendRga, saleId, reason: "Error al cobrar", idempotencyKey: newKey("anular-sol") });
  await approve(f, result.id);
  return result.id;
}

export const voidAs = (
  f: Fixtures,
  saleId: string,
  opts: { actor?: Fixtures["actors"]["vendRga"]; approvalId?: string; key?: string; reason?: string } = {},
) =>
  voidSale({
    actor: opts.actor ?? f.actors.vendRga,
    saleId,
    reason: opts.reason ?? "Error al cobrar",
    approvalId: opts.approvalId,
    idempotencyKey: opts.key ?? newKey("anular"),
  });

export async function expectedCashNow(f: Fixtures, sessionId: string) {
  return (await getCashClosingTotals(f.actors.vendRga, sessionId)).expectedCash;
}

export const closeCajaExact = async (f: Fixtures, sessionId: string) =>
  closeCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, countedCash: await expectedCashNow(f, sessionId) });

export { createApprovalRequest };
