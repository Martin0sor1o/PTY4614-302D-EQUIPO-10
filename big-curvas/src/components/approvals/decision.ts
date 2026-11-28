// Textos de la decisión de Belén tal como la ve la caja. Puros: solo describen el estado que respondió el servidor; no
// deciden si una aprobación sirve (eso lo comprueba el servidor al usarla).

import type { ApprovalLite } from "@/app/(app)/pos/approvals-actions";
import type { StatusTone } from "@/components/ui/status-badge";

export type DecisionData = Pick<ApprovalLite, "status" | "decidedByName" | "decisionComment" | "method" | "expiresAt">;

export interface DecisionView {
  tone: StatusTone;
  title: string;
  /** Comentario de Belén o qué hacer ahora. */
  detail: string | null;
}

export const approverName = (a: Pick<DecisionData, "decidedByName">) => a.decidedByName ?? "Belén";

export const approvedTitle = (a: Pick<DecisionData, "decidedByName">) => `Aprobado por ${approverName(a)} ✓`;

export const isPastExpiry = (expiresAt: string | null, now: number) => expiresAt !== null && new Date(expiresAt).getTime() <= now;

const quoted = (comment: string | null) => (comment ? `“${comment}”` : null);

/** null mientras está PENDIENTE: todavía no hay decisión. */
export function decisionView(a: DecisionData, now: number): DecisionView | null {
  switch (a.status) {
    case "APROBADA": {
      const title = `${approvedTitle(a)}${a.method === "PIN" ? " (con PIN, en la tienda)" : ""}`;
      return isPastExpiry(a.expiresAt, now)
        ? { tone: "warn", title, detail: "Ya pasó su plazo: si al confirmar se rechaza, pide una nueva." }
        : { tone: "ok", title, detail: quoted(a.decisionComment) };
    }
    case "RECHAZADA":
      return { tone: "danger", title: `${approverName(a)} rechazó la solicitud`, detail: quoted(a.decisionComment) };
    case "VENCIDA":
      return { tone: "neutral", title: "La solicitud venció", detail: "Nadie respondió a tiempo. Si todavía la necesitas, pide una nueva." };
    case "USADA":
      return { tone: "info", title: "Esta aprobación ya se usó", detail: null };
    default:
      return null;
  }
}

/** Lo que dice el lector de pantalla cuando llega la decisión: sin símbolos ni relojes que se repitan. */
export function decisionAnnouncement(a: DecisionData): string {
  if (a.status === "PENDIENTE") return "Esperando a Belén.";
  if (a.status === "APROBADA") return [`Aprobado por ${approverName(a)}.`, a.decisionComment].filter(Boolean).join(" ");
  if (a.status === "RECHAZADA") return [`${approverName(a)} rechazó la solicitud.`, a.decisionComment].filter(Boolean).join(" ");
  return a.status === "VENCIDA" ? "La solicitud venció." : "Esta aprobación ya se usó.";
}
