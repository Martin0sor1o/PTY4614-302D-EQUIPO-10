import type { ApprovalMethod, ApprovalStatus, ApprovalType } from "@/generated/prisma/client";

export type { ApprovalMethod, ApprovalStatus, ApprovalType };

/** Lo que se muestra de una solicitud. Lo arma quien la pide (sales), así approvals no sabe de carritos ni ventas. */
export interface ApprovalDisplay {
  headline: string;
  lines: { label: string; value: string }[];
}

/** Forma del `payload` JSON de approval_requests. `binding` es opaco para este módulo. */
export interface ApprovalPayload {
  binding: string;
  reason: string;
  display: ApprovalDisplay;
}

export interface ApprovalView {
  id: string;
  type: ApprovalType;
  /** Ya con el vencimiento aplicado: una PENDIENTE o APROBADA vencida se informa como VENCIDA. */
  status: ApprovalStatus;
  method: ApprovalMethod;
  locationId: string;
  locationName: string;
  requestedByName: string;
  createdAt: Date;
  expiresAt: Date | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  decisionComment: string | null;
  usedAt: Date | null;
  amount: number | null;
  reason: string;
  display: ApprovalDisplay;
}

export interface ApproverOption {
  id: string;
  name: string;
  /** Bloqueada por demasiados intentos fallidos de PIN. */
  lockedUntil: Date | null;
}
