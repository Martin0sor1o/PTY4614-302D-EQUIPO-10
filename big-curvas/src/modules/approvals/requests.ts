import { z } from "zod";
import { db } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { runIdempotent, type IdempotentResult } from "@/lib/idempotency";
import { parseInput } from "@/lib/validation";
import { ApprovalMethod, ApprovalStatus } from "@/generated/prisma/client";
import { getIntSetting, loadView, SETTING_TIMEOUT } from "./internal";
import type { ApprovalDisplay, ApprovalPayload, ApprovalView } from "./types";

const id = z.string().trim().min(1);

const createSchema = z.object({
  type: z.enum(["DESCUENTO_SOBRE_LIMITE", "ANULACION"]),
  locationId: id,
  /** Monto aprobado en CLP (descuento total o lo cobrado de la venta). Se compara al usar la aprobación. */
  amount: z.number().int().min(0),
  /** Huella opaca de lo aprobado (carrito o venta). La calcula quien pide; también al usarla. */
  binding: z.string().trim().min(8).max(128),
  reason: z.string().trim().min(3, "El motivo es obligatorio").max(300),
  display: z.object({
    headline: z.string().max(200),
    lines: z.array(z.object({ label: z.string().max(120), value: z.string().max(300) })).max(60),
  }),
  idempotencyKey: z.string().trim().min(8, "idempotencyKey inválida").max(200),
});

export type CreateApprovalInput = { actor: Actor } & {
  type: "DESCUENTO_SOBRE_LIMITE" | "ANULACION";
  locationId: string;
  amount: number;
  binding: string;
  reason: string;
  display: ApprovalDisplay;
  idempotencyKey: string;
};

/**
 * Solicitud de aprobación de una VENDEDORA en su ubicación (RF-AUT-01). Queda PENDIENTE y vence a los
 * `approval_timeout_minutes` de creada (RF-AUT-04). Idempotente por `idempotencyKey`.
 * `approvals` no ejecuta la acción: la ejecuta el módulo solicitante con el approvalId como credencial de un solo uso.
 */
export async function createApprovalRequest(input: CreateApprovalInput): Promise<IdempotentResult<ApprovalView>> {
  assertAccess(input.actor, { roles: ["VENDEDORA"], locationId: input.locationId });
  const data = parseInput(createSchema, input);

  return runIdempotent({
    find: async () => {
      const existing = await db.approvalRequest.findUnique({ where: { idempotencyKey: data.idempotencyKey }, select: { id: true, type: true, locationId: true } });
      if (!existing) return null;
      if (existing.type !== data.type || existing.locationId !== data.locationId) {
        throw new AppError("CONFLICT", "Esa clave de operación ya fue usada para otra solicitud.");
      }
      return loadView(db, existing.id);
    },
    execute: async () => {
      const timeout = await getIntSetting(db, SETTING_TIMEOUT);
      const payload: ApprovalPayload = { binding: data.binding, reason: data.reason, display: data.display };
      const row = await db.approvalRequest.create({
        data: {
          type: data.type,
          locationId: data.locationId,
          requestedBy: input.actor.id,
          payload: payload as unknown as object,
          amount: data.amount,
          status: ApprovalStatus.PENDIENTE,
          method: ApprovalMethod.REMOTA,
          expiresAt: new Date(Date.now() + timeout * 60_000),
          idempotencyKey: data.idempotencyKey,
        },
        select: { id: true },
      });
      // Se lee aparte: un create con relaciones anidadas en el select las pide en paralelo sobre una sola conexión.
      return loadView(db, row.id);
    },
  });
}
