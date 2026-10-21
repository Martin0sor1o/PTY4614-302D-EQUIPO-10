"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAppError, userMessage } from "@/lib/errors";
import { requireAccess } from "@/modules/auth";
import { approveRequest, rejectRequest } from "@/modules/approvals";

// Decisiones de Belén desde su celular (RF-AUT-02). Solo ADMIN; el servicio vuelve a validarlo (regla 10).

export type DecisionResult = { ok: true; status: string } | { ok: false; message: string; code?: string };

const schema = z.object({
  requestId: z.string().trim().min(1).max(64),
  comment: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
});

async function decide(payload: unknown, decision: "approve" | "reject"): Promise<DecisionResult> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  try {
    const user = await requireAccess({ roles: ["ADMIN"] });
    const input = { actor: user, ...parsed.data, comment: parsed.data.comment || undefined };
    const { result } = decision === "approve" ? await approveRequest(input) : await rejectRequest(input);
    revalidatePath("/aprobaciones");
    return { ok: true, status: result.status };
  } catch (error) {
    return { ok: false, message: userMessage(error), code: isAppError(error) ? error.code : undefined };
  }
}

export async function approveAction(payload: unknown): Promise<DecisionResult> {
  return decide(payload, "approve");
}

export async function rejectAction(payload: unknown): Promise<DecisionResult> {
  return decide(payload, "reject");
}
