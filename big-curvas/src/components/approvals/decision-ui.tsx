"use client";

import { useEffect, useState } from "react";
import { CheckCheck, CircleCheck, Hourglass, TimerOff, WifiOff, XCircle, type LucideIcon } from "lucide-react";
import { Notice } from "@/components/ui/notice";
import { decisionView, type DecisionData } from "./decision";
import type { LinkProblem } from "./watch-approval";

export const DECISION_ICON: Record<Exclude<DecisionData["status"], "PENDIENTE">, LucideIcon> = {
  APROBADA: CircleCheck,
  RECHAZADA: XCircle,
  VENCIDA: TimerOff,
  USADA: CheckCheck,
};

/** Región fija para el lector de pantalla: existe desde que empieza la espera y cambia cuando llega la decisión. */
export function DecisionAnnouncer({ text }: { text: string }) {
  return (
    <p className="sr-only" role="status" aria-live="polite" data-testid="decision-announcer">
      {text}
    </p>
  );
}

/** «En vivo» mientras las consultas llegan; si no, lo dice con texto e ícono (nunca solo con color). */
export function LiveLink({ problem }: { problem: LinkProblem | null }) {
  return (
    <div role="status" aria-live="polite" data-testid="live-link">
      {problem ? (
        <Notice tone="danger" icon={WifiOff} className="py-2" data-testid={`live-${problem.kind}`}>
          {problem.text}
        </Notice>
      ) : (
        <p className="flex items-center gap-2 text-xs font-semibold">
          <span aria-hidden className="size-2 animate-pulse rounded-full bg-tone-ok motion-reduce:animate-none" />
          En vivo: la respuesta aparece sola.
        </p>
      )}
    </div>
  );
}

/**
 * La decisión, repetida en una línea junto al botón de confirmar: con un carrito largo, el recuadro de la solicitud puede
 * quedar fuera de la vista. No se anuncia (ya lo hace `DecisionAnnouncer`) ni toma el foco.
 */
export function DecisionStrip({ approval }: { approval: DecisionData }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(clock);
  }, []);

  if (approval.status === "USADA") return null;
  const view = decisionView(approval, now);
  return view ? (
    <Notice tone={view.tone} icon={DECISION_ICON[approval.status as keyof typeof DECISION_ICON]} className="py-2 font-bold" data-testid="decision-strip">
      {view.title}
    </Notice>
  ) : (
    <Notice tone="warn" icon={Hourglass} className="py-2 font-bold" data-testid="decision-strip">
      Esperando a Belén…
    </Notice>
  );
}
