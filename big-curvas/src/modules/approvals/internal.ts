import { db, type Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { Prisma, type ApprovalStatus } from "@/generated/prisma/client";
import type { ApprovalPayload, ApprovalView } from "./types";

// Utilidades internas del módulo approvals (no se exportan desde index.ts).

export const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5_000,
  timeout: 10_000,
} as const;

export const SETTING_TIMEOUT = "approval_timeout_minutes";
export const SETTING_PIN_MAX = "pin_max_attempts";
export const SETTING_PIN_LOCK = "pin_lock_minutes";

export const DECISION_ACTION = "APPROVAL_DECISION";

export async function getIntSetting(reader: Pick<Tx, "setting">, key: string): Promise<number> {
  const s = await reader.setting.findUnique({ where: { key } });
  if (!s || s.valueInt === null) throw new AppError("VALIDATION", `Falta la configuración ${key}.`);
  return s.valueInt;
}

/**
 * Vencimiento SIN job: una solicitud PENDIENTE o una aprobación APROBADA cuyo `expires_at` ya pasó se marca VENCIDA
 * (con el reloj de la BD). Se llama antes de consultar o decidir; es idempotente.
 */
export async function expireStale(reader: Pick<Tx, "$executeRaw">): Promise<void> {
  await reader.$executeRaw`
    UPDATE approval_requests SET status = 'VENCIDA'::approval_status
    WHERE status IN ('PENDIENTE'::approval_status, 'APROBADA'::approval_status) AND expires_at IS NOT NULL AND expires_at <= now()`;
}

export const viewSelect = {
  id: true,
  type: true,
  status: true,
  method: true,
  locationId: true,
  amount: true,
  payload: true,
  createdAt: true,
  expiresAt: true,
  decidedAt: true,
  decisionComment: true,
  usedAt: true,
  location: { select: { name: true } },
  requester: { select: { name: true } },
  decider: { select: { name: true } },
} satisfies Prisma.ApprovalRequestSelect;

type Row = Prisma.ApprovalRequestGetPayload<{ select: typeof viewSelect }>;

function parsePayload(raw: Prisma.JsonValue): ApprovalPayload {
  const p = (raw ?? {}) as Partial<ApprovalPayload>;
  return {
    binding: typeof p.binding === "string" ? p.binding : "",
    reason: typeof p.reason === "string" ? p.reason : "",
    display: p.display ?? { headline: "Solicitud", lines: [] },
  };
}

export function toView(row: Row, now = new Date()): ApprovalView {
  const payload = parsePayload(row.payload);
  const expired = (row.status === "PENDIENTE" || row.status === "APROBADA") && row.expiresAt !== null && row.expiresAt <= now;
  return {
    id: row.id,
    type: row.type,
    status: expired ? "VENCIDA" : row.status,
    method: row.method,
    locationId: row.locationId,
    locationName: row.location.name,
    requestedByName: row.requester.name,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    decidedAt: row.decidedAt,
    decidedByName: row.decider?.name ?? null,
    decisionComment: row.decisionComment,
    usedAt: row.usedAt,
    amount: row.amount,
    reason: payload.reason,
    display: payload.display,
  };
}

export async function loadView(reader: Pick<Tx, "approvalRequest">, id: string): Promise<ApprovalView> {
  const row = await reader.approvalRequest.findUnique({ where: { id }, select: viewSelect });
  if (!row) throw new AppError("NOT_FOUND", "La solicitud de aprobación no existe.", { approvalId: id });
  return toView(row);
}

/** Huella de idempotencia de una decisión (aprobar, rechazar, PIN): la fila de audit_log con la clave. */
export async function findDecision(idempotencyKey: string, requestId: string): Promise<ApprovalView | null> {
  const done = await db.auditLog.findFirst({
    where: { action: DECISION_ACTION, entity: "approval_request", entityId: requestId, after: { path: ["idempotencyKey"], equals: idempotencyKey } },
    select: { id: true },
  });
  return done ? loadView(db, requestId) : null;
}

export const STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDIENTE: "pendiente",
  APROBADA: "aprobada",
  RECHAZADA: "rechazada",
  VENCIDA: "vencida",
  USADA: "usada",
};
