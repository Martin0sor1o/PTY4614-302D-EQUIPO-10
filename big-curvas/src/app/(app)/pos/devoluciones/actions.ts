"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SessionLocation } from "@/lib/access";
import { isAppError, userMessage } from "@/lib/errors";
import { isRetryByAnotherUser, OTHER_USER_MESSAGE } from "@/lib/pending-attempt";
import { requireAccess } from "@/modules/auth";
import {
  createReturn,
  createReturnRequestSchema,
  findReturnByAttemptKey,
  getSaleForReturn,
  quoteReturn,
  quoteReturnRequestSchema,
  requestReturnApproval,
  requestReturnApprovalRequestSchema,
  searchSalesForReturn,
  type ReturnQuote,
  type ReturnSaleHit,
  type ReturnableSale,
} from "@/modules/returns";
import { lookupVoucher } from "@/modules/vouchers";
import type { ApprovalView } from "@/modules/approvals";
import type { ApprovalLite } from "@/app/(app)/pos/approvals-actions";

// Adaptadores del flujo "Cambio / Devolución": validan con Zod, resuelven la ubicación DESDE LA SESIÓN (nunca desde el navegador)
// y delegan en returns, que vuelve a validar rol y ubicación (regla 10). Los errores de negocio vuelven como datos.
// VENDEDORA: su tienda. ADMIN: la ubicación elegida en "Operando en" (tienda o bodega: Belén registra ahí las devoluciones).

export type Failure = { ok: false; message: string; code?: string; uncertain?: boolean };

const failure = (error: unknown): Failure => ({ ok: false, message: userMessage(error), code: isAppError(error) ? error.code : undefined });
const invalid = (error: z.ZodError): Failure => ({ ok: false, message: error.issues[0]?.message ?? "Datos inválidos." });
const NO_LOCATION: Failure = { ok: false, message: "Elige una ubicación en “Operando en” para registrar devoluciones." };

async function context() {
  const user = await requireAccess({ roles: ["ADMIN", "VENDEDORA"] });
  const location: SessionLocation | null = user.activeLocation;
  if (!location) return { user, location: null } as const;
  await requireAccess({ roles: ["ADMIN", "VENDEDORA"], locationId: location.id });
  return { user, location } as const;
}

// ── Lo que viaja al navegador: sin Date (todo texto ISO) ──

export interface ReturnableSaleLite extends Omit<ReturnableSale, "createdAt" | "referenceDate"> {
  createdAt: string;
  referenceDate: string;
}
export interface ReturnSaleHitLite extends Omit<ReturnSaleHit, "createdAt"> {
  createdAt: string;
}
export interface VoucherLite {
  code: string;
  status: string;
  balance: number;
  initialAmount: number;
  expiresAt: string;
}

const liteSale = ({ createdAt, referenceDate, ...rest }: ReturnableSale): ReturnableSaleLite => ({ ...rest, createdAt: createdAt.toISOString(), referenceDate: referenceDate.toISOString() });

function liteApproval(v: ApprovalView): ApprovalLite {
  return {
    id: v.id,
    status: v.status,
    method: v.method,
    decidedByName: v.decidedByName,
    decisionComment: v.decisionComment,
    createdAt: v.createdAt.toISOString(),
    expiresAt: v.expiresAt?.toISOString() ?? null,
    amount: v.amount,
    reason: v.reason,
    headline: v.display.headline,
  };
}

const querySchema = z.string().trim().max(60);
const saleIdSchema = z.string().trim().min(1).max(64);

export async function searchReturnSalesAction(query: string): Promise<{ ok: true; sales: ReturnSaleHitLite[] } | Failure> {
  try {
    const { user, location } = await context();
    if (!location) return NO_LOCATION;
    const parsed = querySchema.safeParse(query ?? "");
    if (!parsed.success) return { ok: true, sales: [] };
    const hits = await searchSalesForReturn({ actor: user, locationId: location.id, query: parsed.data });
    return { ok: true, sales: hits.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })) };
  } catch (error) {
    return failure(error);
  }
}

export async function getReturnSaleAction(saleId: string): Promise<{ ok: true; sale: ReturnableSaleLite } | Failure> {
  const parsed = saleIdSchema.safeParse(saleId);
  if (!parsed.success) return { ok: false, message: "Venta inválida." };
  try {
    const { user, location } = await context();
    if (!location) return NO_LOCATION;
    return { ok: true, sale: liteSale(await getSaleForReturn({ actor: user, locationId: location.id, saleId: parsed.data })) };
  } catch (error) {
    return failure(error);
  }
}

export async function quoteReturnAction(payload: unknown): Promise<{ ok: true; quote: ReturnQuote } | Failure> {
  const parsed = quoteReturnRequestSchema.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { user, location } = await context();
    if (!location) return NO_LOCATION;
    return { ok: true, quote: await quoteReturn({ actor: user, locationId: location.id, ...parsed.data }) };
  } catch (error) {
    return failure(error);
  }
}

export async function requestReturnApprovalAction(payload: unknown): Promise<{ ok: true; approval: ApprovalLite } | Failure> {
  const parsed = requestReturnApprovalRequestSchema.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { user, location } = await context();
    if (!location) return NO_LOCATION;
    const { result } = await requestReturnApproval({ actor: user, locationId: location.id, ...parsed.data });
    return { ok: true, approval: liteApproval(result) };
  } catch (error) {
    return failure(error);
  }
}

/** Confirma la devolución o el cambio. La vendedora lo ejecuta con el approvalId de Belén; Belén (ADMIN) opera directo. */
export async function createReturnAction(payload: unknown): Promise<{ ok: true; returnId: string; number: string } | Failure> {
  const parsed = createReturnRequestSchema.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { user, location } = await context();
    if (!location) return NO_LOCATION;
    if (isRetryByAnotherUser(payload, user.id)) return { ok: false, message: OTHER_USER_MESSAGE, code: "FORBIDDEN" };
    const { result } = await createReturn({ actor: user, locationId: location.id, ...parsed.data });
    revalidatePath("/stock");
    revalidatePath("/pos", "layout");
    revalidatePath("/vales");
    return { ok: true, returnId: result.id, number: result.number };
  } catch (error) {
    // Un error que no es de negocio pudo ocurrir después de guardar: la caja lo trata como "sin confirmar".
    return { ...failure(error), uncertain: isAppError(error) ? undefined : true };
  }
}

/** ¿Quedó registrada la devolución o el cambio de este envío? SOLO LECTURA. Server Action (POST): la clave nunca va en la URL. */
export async function checkReturnAttemptAction(idempotencyKey: string): Promise<{ ok: true; found: { id: string; number: string } | null } | Failure> {
  try {
    const { user, location } = await context();
    if (!location) return NO_LOCATION;
    return { ok: true, found: await findReturnByAttemptKey({ actor: user, locationId: location.id, idempotencyKey }) };
  } catch (error) {
    return failure(error);
  }
}

/** Consulta de un vale por código desde la caja (con límite de intentos fallidos por usuario). */
export async function lookupVoucherAction(code: string): Promise<{ ok: true; voucher: VoucherLite } | Failure> {
  const parsed = z.string().trim().min(1, "Escribe el código del vale").max(40, "Código de vale inválido").safeParse(code);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const user = await requireAccess({ roles: ["ADMIN", "VENDEDORA"] });
    const v = await lookupVoucher(user, parsed.data);
    return { ok: true, voucher: { code: v.code, status: v.status, balance: v.balance, initialAmount: v.initialAmount, expiresAt: v.expiresAt.toISOString() } };
  } catch (error) {
    return failure(error);
  }
}
