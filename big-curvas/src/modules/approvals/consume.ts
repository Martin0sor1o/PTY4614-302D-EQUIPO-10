import type { Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { expireStale, STATUS_LABEL } from "./internal";
import type { ApprovalPayload, ApprovalType } from "./types";

/**
 * USAR una aprobación (credencial de un solo uso, docs/03 §6.4). La llama el módulo solicitante (sales) DENTRO de la
 * transacción de la venta o anulación: si esa transacción se revierte, la aprobación vuelve a estar disponible.
 *
 * Un único UPDATE condicional exige a la vez: APROBADA, no vencida, mismo tipo, misma ubicación, mismo monto y el mismo
 * binding (huella del carrito o de la venta, recalculada por quien la usa). Si no afecta filas, la lectura posterior
 * solo sirve para dar el motivo exacto. Dos usos simultáneos: gana uno, el otro recibe APROBACION_INVALIDA.
 */
export async function consumeApproval(
  tx: Tx,
  input: {
    actor: Actor;
    approvalId: string;
    type: ApprovalType;
    locationId: string;
    amount: number;
    binding: string;
    usedRefType: "SALE";
    usedRefId: string;
  },
): Promise<void> {
  assertAccess(input.actor, { roles: ["VENDEDORA"], locationId: input.locationId });
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE approval_requests
    SET status = 'USADA'::approval_status, used_at = now(), used_ref_type = ${input.usedRefType}, used_ref_id = ${input.usedRefId}
    WHERE id = ${input.approvalId}
      AND status = 'APROBADA'::approval_status
      AND expires_at > now()
      AND type = ${input.type}::approval_type
      AND location_id = ${input.locationId}
      AND amount = ${input.amount}
      AND payload->>'binding' = ${input.binding}
    RETURNING id`;
  if (rows.length > 0) return;

  // No se pudo usar: se explica por qué.
  await expireStale(tx);
  const a = await tx.approvalRequest.findUnique({ where: { id: input.approvalId } });
  const invalid = (message: string) => new AppError("APROBACION_INVALIDA", message, { approvalId: input.approvalId, status: a?.status });
  if (!a) throw invalid("La aprobación indicada no existe.");
  if (a.type !== input.type) throw invalid("La aprobación no corresponde a este tipo de acción.");
  if (a.locationId !== input.locationId) throw invalid("La aprobación es de otra ubicación.");
  if (a.status === "USADA") throw invalid("Esta aprobación ya fue usada: cada aprobación sirve una sola vez.");
  if (a.status === "PENDIENTE") throw new AppError("APROBACION_REQUERIDA", "Belén todavía no responde la solicitud.", { approvalId: a.id });
  if (a.status === "RECHAZADA") throw invalid("Belén rechazó la solicitud.");
  if (a.status === "VENCIDA" || (a.expiresAt && a.expiresAt <= new Date())) throw invalid("La aprobación venció: pide una nueva.");
  const payload = (a.payload ?? {}) as Partial<ApprovalPayload>;
  if (a.amount !== input.amount || payload.binding !== input.binding) {
    throw invalid(
      input.type === "DESCUENTO_SOBRE_LIMITE"
        ? "El carrito cambió después de la aprobación (prendas, cantidades, descuentos o precios): pide una nueva aprobación."
        : "La aprobación no corresponde a esta venta o a su monto.",
    );
  }
  throw invalid(`La aprobación no se puede usar (está ${STATUS_LABEL[a.status]}).`);
}
