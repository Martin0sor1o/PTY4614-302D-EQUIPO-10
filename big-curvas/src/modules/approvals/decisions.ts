import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { runIdempotent, type IdempotentResult } from "@/lib/idempotency";
import { formatTime } from "@/lib/dates";
import { parseInput } from "@/lib/validation";
import {
  DECISION_ACTION,
  expireStale,
  findDecision,
  getIntSetting,
  loadView,
  SETTING_PIN_LOCK,
  SETTING_PIN_MAX,
  SETTING_TIMEOUT,
  STATUS_LABEL,
  TX_OPTIONS,
} from "./internal";
import { verifyPin } from "./pin";
import type { ApprovalView } from "./types";

// Decisiones de Belén sobre una solicitud: aprobar, rechazar (remotas, desde /aprobaciones) o aprobar en el equipo de
// la caja con su PIN (RF-AUT-05). Todos los cambios de estado son condicionales (WHERE status = 'PENDIENTE' y no
// vencida): decidir dos veces, o decidir una vencida, es CONFLICT. Idempotentes por `idempotencyKey` (audit_log).

const id = z.string().trim().min(1);
const key = z.string().trim().min(8, "idempotencyKey inválida").max(200);
const comment = z.string().trim().max(300).optional();

type Decision = "APROBADA" | "RECHAZADA";

interface DecisionArgs {
  requestId: string;
  decision: Decision;
  decidedBy: string;
  method: "REMOTA" | "PIN";
  comment?: string;
  idempotencyKey: string;
  /** Quién operó el equipo (en la aprobación con PIN: la vendedora o la sesión abierta en la caja). */
  operatedBy: string;
}

/**
 * UPDATE condicional de la solicitud. Al aprobar, la vigencia se renueva: la aprobada vence a los
 * `approval_timeout_minutes` DESDE LA DECISIÓN (la pendiente vence desde que se creó). Devuelve false si no estaba
 * PENDIENTE o ya venció.
 */
async function applyDecision(tx: Tx, a: DecisionArgs): Promise<boolean> {
  const note = a.comment || null;
  let rows: { id: string; type: string; amount: number | null; location_id: string }[];
  if (a.decision === "APROBADA") {
    const timeout = await getIntSetting(tx, SETTING_TIMEOUT);
    rows = await tx.$queryRaw`
      UPDATE approval_requests
      SET status = 'APROBADA'::approval_status, method = ${a.method}::approval_method, decided_by = ${a.decidedBy}, decided_at = now(),
          decision_comment = ${note}, expires_at = now() + make_interval(mins => ${timeout}::int)
      WHERE id = ${a.requestId} AND status = 'PENDIENTE'::approval_status AND expires_at > now()
      RETURNING id, type, amount, location_id`;
  } else {
    rows = await tx.$queryRaw`
      UPDATE approval_requests
      SET status = 'RECHAZADA'::approval_status, method = ${a.method}::approval_method, decided_by = ${a.decidedBy}, decided_at = now(),
          decision_comment = ${note}
      WHERE id = ${a.requestId} AND status = 'PENDIENTE'::approval_status AND expires_at > now()
      RETURNING id, type, amount, location_id`;
  }
  const row = rows[0];
  if (!row) return false;
  await tx.auditLog.create({
    data: {
      userId: a.operatedBy,
      locationId: row.location_id,
      action: DECISION_ACTION,
      entity: "approval_request",
      entityId: a.requestId,
      before: { status: "PENDIENTE" },
      after: {
        idempotencyKey: a.idempotencyKey,
        decision: a.decision,
        method: a.method,
        approvedBy: a.decidedBy,
        type: row.type,
        amount: row.amount,
        comment: note,
      },
    },
  });
  return true;
}

/** Explica por qué no se pudo decidir (la lectura es solo para el mensaje). Marca como VENCIDA lo vencido. */
async function explainNotPending(requestId: string): Promise<never> {
  await expireStale(db);
  const view = await loadView(db, requestId); // NOT_FOUND si no existe
  throw new AppError(
    "CONFLICT",
    view.status === "VENCIDA"
      ? "La solicitud venció: la vendedora debe pedir una nueva."
      : `La solicitud ya está ${STATUS_LABEL[view.status]}: no se puede decidir de nuevo.`,
    { approvalId: requestId, status: view.status },
  );
}

async function decideRemote(
  actor: Actor,
  input: { requestId: string; comment?: string; idempotencyKey: string },
  decision: Decision,
): Promise<IdempotentResult<ApprovalView>> {
  assertAccess(actor, { roles: ["ADMIN"] });
  const data = parseInput(z.object({ requestId: id, comment, idempotencyKey: key }), input);
  return runIdempotent({
    find: () => findDecision(data.idempotencyKey, data.requestId),
    execute: async () => {
      const ok = await db.$transaction(
        (tx) => applyDecision(tx, { requestId: data.requestId, decision, decidedBy: actor.id, method: "REMOTA", comment: data.comment, idempotencyKey: data.idempotencyKey, operatedBy: actor.id }),
        TX_OPTIONS,
      );
      if (!ok) await explainNotPending(data.requestId);
      return loadView(db, data.requestId);
    },
  });
}

/** Belén aprueba desde su celular (RF-AUT-02). Solo ADMIN. */
export function approveRequest(input: { actor: Actor; requestId: string; comment?: string; idempotencyKey: string }) {
  return decideRemote(input.actor, input, "APROBADA");
}

/** Belén rechaza (con comentario opcional). Solo ADMIN. */
export function rejectRequest(input: { actor: Actor; requestId: string; comment?: string; idempotencyKey: string }) {
  return decideRemote(input.actor, input, "RECHAZADA");
}

/**
 * Aprobación presencial (RF-AUT-05): en el equipo de la caja se elige a la administradora y se ingresa SU PIN. Los fallos
 * cuentan solo para esa persona; tras `pin_max_attempts` queda bloqueada por `pin_lock_minutes`. La aprobación queda con
 * método PIN. La puede operar la vendedora de esa ubicación o el ADMIN.
 */
export async function approveWithPin(input: {
  actor: Actor;
  requestId: string;
  approverId: string;
  pin: string;
  idempotencyKey: string;
}): Promise<IdempotentResult<ApprovalView>> {
  assertAccess(input.actor, { roles: ["VENDEDORA", "ADMIN"] });
  const data = parseInput(z.object({ requestId: id, approverId: id, pin: z.string().trim().min(4, "Ingresa el PIN").max(12), idempotencyKey: key }), input);
  await expireStale(db);
  const request = await loadView(db, data.requestId);
  assertAccess(input.actor, { roles: ["VENDEDORA", "ADMIN"], locationId: request.locationId });

  return runIdempotent({
    find: () => findDecision(data.idempotencyKey, data.requestId),
    execute: async () => {
      if (request.status !== "PENDIENTE") await explainNotPending(data.requestId);

      const approver = await db.user.findFirst({
        where: { id: data.approverId, role: "ADMIN", active: true, pinHash: { not: null } },
        select: { id: true, name: true, pinHash: true },
      });
      if (!approver?.pinHash) throw new AppError("VALIDATION", "Elige a la administradora que aprueba (debe tener PIN).");

      const maxAttempts = await getIntSetting(db, SETTING_PIN_MAX);
      const lockMinutes = await getIntSetting(db, SETTING_PIN_LOCK);
      // Un bloqueo que ya terminó se limpia antes de contar.
      await db.$executeRaw`UPDATE users SET failed_pin_attempts = 0, pin_locked_until = NULL
        WHERE id = ${approver.id} AND pin_locked_until IS NOT NULL AND pin_locked_until <= now()`;
      const state = await db.user.findUniqueOrThrow({ where: { id: approver.id }, select: { pinLockedUntil: true } });
      if (state.pinLockedUntil && state.pinLockedUntil > new Date()) {
        throw new AppError("FORBIDDEN", `El PIN de ${approver.name} está bloqueado hasta las ${formatTime(state.pinLockedUntil)} por demasiados intentos fallidos.`, {
          lockedUntil: state.pinLockedUntil.toISOString(),
        });
      }

      if (!verifyPin(data.pin, approver.pinHash)) {
        // Se registra FUERA de cualquier transacción que pueda revertirse: el fallo debe quedar aunque se lance el error.
        const [after] = await db.$queryRaw<{ failed_pin_attempts: number; pin_locked_until: Date | null }[]>`
          UPDATE users
          SET failed_pin_attempts = failed_pin_attempts + 1,
              pin_locked_until = CASE WHEN failed_pin_attempts + 1 >= ${maxAttempts} THEN now() + make_interval(mins => ${lockMinutes}::int) ELSE pin_locked_until END
          WHERE id = ${approver.id}
          RETURNING failed_pin_attempts, pin_locked_until`;
        const locked = after.pin_locked_until !== null;
        await db.auditLog.create({
          data: {
            userId: input.actor.id,
            locationId: request.locationId,
            action: locked ? "PIN_LOCKED" : "PIN_FAILED",
            entity: "user",
            entityId: approver.id,
            after: { requestId: data.requestId, attempts: after.failed_pin_attempts, lockedUntil: after.pin_locked_until?.toISOString() ?? null },
          },
        });
        throw new AppError(
          "VALIDATION",
          locked
            ? `PIN incorrecto. El PIN de ${approver.name} se bloqueó por ${lockMinutes} minutos.`
            : `PIN incorrecto. Quedan ${maxAttempts - after.failed_pin_attempts} intento${maxAttempts - after.failed_pin_attempts === 1 ? "" : "s"}.`,
          { remainingAttempts: Math.max(0, maxAttempts - after.failed_pin_attempts), locked },
        );
      }

      const ok = await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: approver.id }, data: { failedPinAttempts: 0, pinLockedUntil: null } });
        return applyDecision(tx, {
          requestId: data.requestId,
          decision: "APROBADA",
          decidedBy: approver.id,
          method: "PIN",
          idempotencyKey: data.idempotencyKey,
          operatedBy: input.actor.id,
        });
      }, TX_OPTIONS);
      if (!ok) await explainNotPending(data.requestId);
      return loadView(db, data.requestId);
    },
  });
}
