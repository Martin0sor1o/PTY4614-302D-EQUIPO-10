"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SessionLocation } from "@/lib/access";
import { isAppError, userMessage } from "@/lib/errors";
import { requireAccess } from "@/modules/auth";
import { approveWithPin, getApprovalStatus, listApprovers, type ApprovalView, type ApproverOption } from "@/modules/approvals";
import { requestDiscountApproval, requestVoidApproval, voidSale } from "@/modules/sales";

// Adaptadores de las aprobaciones desde la caja: la ubicación sale SIEMPRE de la sesión, nunca del navegador. Los
// servicios vuelven a validar rol y ubicación (regla 10). Los errores de negocio vuelven como datos.

export type Failure = { ok: false; message: string; code?: string };

function failure(error: unknown): Failure {
  return { ok: false, message: userMessage(error), code: isAppError(error) ? error.code : undefined };
}

const invalid = (error: z.ZodError): Failure => ({ ok: false, message: error.issues[0]?.message ?? "Datos inválidos." });
const id = z.string().trim().min(1).max(64);
const key = z.string().trim().min(8).max(200);

/** Lo que necesita la caja que espera: sin datos internos y con fechas como texto. */
export interface ApprovalLite {
  id: string;
  status: ApprovalView["status"];
  method: ApprovalView["method"];
  decidedByName: string | null;
  decisionComment: string | null;
  createdAt: string;
  expiresAt: string | null;
  amount: number | null;
  reason: string;
  headline: string;
}

function lite(v: ApprovalView): ApprovalLite {
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

async function storeContext() {
  const user = await requireAccess({ roles: ["ADMIN", "VENDEDORA"] });
  const location: SessionLocation | null = user.activeLocation;
  if (!location) throw new Error("NO_LOCATION");
  await requireAccess({ roles: ["ADMIN", "VENDEDORA"], locationId: location.id });
  return { user, location };
}

const NO_LOCATION: Failure = { ok: false, message: "Elige una tienda en “Operando en” para usar el POS." };

export async function requestDiscountApprovalAction(payload: unknown): Promise<{ ok: true; approval: ApprovalLite } | Failure> {
  const parsed = z
    .object({
      lines: z.array(z.object({ variantId: id, qty: z.number().int().positive().max(1_000), discountBps: z.number().int().min(0).max(10_000) })).min(1).max(100),
      reason: z.string().max(300),
      idempotencyKey: key,
    })
    .safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { user, location } = await storeContext();
    const { result } = await requestDiscountApproval({ actor: user, locationId: location.id, ...parsed.data });
    return { ok: true, approval: lite(result) };
  } catch (error) {
    return error instanceof Error && error.message === "NO_LOCATION" ? NO_LOCATION : failure(error);
  }
}

export async function requestVoidApprovalAction(payload: unknown): Promise<{ ok: true; approval: ApprovalLite } | Failure> {
  const parsed = z.object({ saleId: id, reason: z.string().max(300), idempotencyKey: key }).safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const user = await requireAccess({ roles: ["VENDEDORA"] });
    const { result } = await requestVoidApproval({ actor: user, ...parsed.data });
    return { ok: true, approval: lite(result) };
  } catch (error) {
    return failure(error);
  }
}

/** La caja que espera consulta el estado cada ~3 s. */
export async function getApprovalStatusAction(approvalId: string): Promise<{ ok: true; approval: ApprovalLite } | Failure> {
  const parsed = id.safeParse(approvalId);
  if (!parsed.success) return { ok: false, message: "Solicitud inválida." };
  try {
    const user = await requireAccess({ roles: ["ADMIN", "VENDEDORA"] });
    return { ok: true, approval: lite(await getApprovalStatus({ actor: user, approvalId: parsed.data })) };
  } catch (error) {
    return failure(error);
  }
}

export async function listApproversAction(): Promise<{ ok: true; approvers: { id: string; name: string; lockedUntil: string | null }[] } | Failure> {
  try {
    const user = await requireAccess({ roles: ["ADMIN", "VENDEDORA"] });
    const rows: ApproverOption[] = await listApprovers({ actor: user });
    return { ok: true, approvers: rows.map((a) => ({ id: a.id, name: a.name, lockedUntil: a.lockedUntil?.toISOString() ?? null })) };
  } catch (error) {
    return failure(error);
  }
}

/** "Belén está aquí": se elige a la administradora y se ingresa su PIN en el equipo de la caja (RF-AUT-05). */
export async function approveWithPinAction(payload: unknown): Promise<{ ok: true; approval: ApprovalLite } | Failure> {
  const parsed = z.object({ requestId: id, approverId: id, pin: z.string().max(12), idempotencyKey: key }).safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const user = await requireAccess({ roles: ["ADMIN", "VENDEDORA"] });
    const { result } = await approveWithPin({ actor: user, ...parsed.data });
    return { ok: true, approval: lite(result) };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Anula una venta del día. La vendedora lo ejecuta con el approvalId que le dio Belén; Belén (ADMIN) la anula directo,
 * sin solicitud, y queda en audit_log.
 */
export async function voidSaleAction(payload: unknown): Promise<{ ok: true; number: string } | Failure> {
  const parsed = z.object({ saleId: id, reason: z.string().max(300), approvalId: id.optional(), idempotencyKey: key }).safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const user = await requireAccess({ roles: ["ADMIN", "VENDEDORA"] });
    const { result } = await voidSale({ actor: user, ...parsed.data });
    revalidatePath("/pos/ventas");
    revalidatePath("/pos/caja");
    revalidatePath("/stock");
    return { ok: true, number: result.number };
  } catch (error) {
    return failure(error);
  }
}
