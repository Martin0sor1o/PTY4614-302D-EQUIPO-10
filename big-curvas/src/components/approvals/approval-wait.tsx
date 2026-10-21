"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, Clock, KeyRound, Loader2, XCircle } from "lucide-react";
import {
  approveWithPinAction,
  getApprovalStatusAction,
  listApproversAction,
  type ApprovalLite,
} from "@/app/(app)/pos/approvals-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const POLL_MS = 3000;

function secondsSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
}

function ago(iso: string): string {
  const s = secondsSince(iso);
  if (s < 60) return `hace ${s} s`;
  return `hace ${Math.floor(s / 60)} min`;
}

function untilText(iso: string | null): string {
  if (!iso) return "";
  const s = Math.floor((new Date(iso).getTime() - Date.now()) / 1000);
  if (s <= 0) return "vencida";
  return s >= 60 ? `vence en ${Math.ceil(s / 60)} min` : `vence en ${s} s`;
}

/**
 * La caja queda esperando la decisión de Belén (RF-AUT-03): consulta el estado cada ~3 s. Belén puede decidir desde su
 * celular o, si está en la tienda, con su PIN en este mismo equipo ("Belén está aquí"). Informa cada cambio a quien lo
 * usa (`onStatus`) y muestra el motivo si la solicitud se rechaza o vence: no deja nada a medias.
 */
export function ApprovalWait({
  approval,
  onStatus,
  onClose,
  closeLabel = "Cerrar",
  demoPinHint,
}: {
  approval: ApprovalLite;
  onStatus: (a: ApprovalLite) => void;
  onClose: () => void;
  closeLabel?: string;
  demoPinHint: string | null;
}) {
  const [current, setCurrent] = useState(approval);
  const [, tick] = useState(0);
  const [pinOpen, setPinOpen] = useState(false);
  const [approvers, setApprovers] = useState<{ id: string; name: string; lockedUntil: string | null }[]>([]);
  const [approverId, setApproverId] = useState("");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pinKey = useRef(crypto.randomUUID());
  const reported = useRef(approval.status);

  // Consulta cada ~3 s mientras esté PENDIENTE; el reloj de "hace N s" se refresca cada segundo.
  useEffect(() => {
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(clock);
  }, []);
  useEffect(() => {
    if (current.status !== "PENDIENTE") return;
    let stopped = false;
    const poll = async () => {
      const res = await getApprovalStatusAction(current.id);
      if (stopped || !res.ok) return;
      setCurrent(res.approval);
    };
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [current.id, current.status]);

  useEffect(() => {
    if (current.status !== reported.current) {
      reported.current = current.status;
      onStatus(current);
    }
  }, [current, onStatus]);

  async function openPin() {
    setPinOpen(true);
    setPinError(null);
    const res = await listApproversAction();
    if (!res.ok) return setPinError(res.message);
    setApprovers(res.approvers);
    setApproverId((prev) => prev || res.approvers.find((a) => !a.lockedUntil)?.id || res.approvers[0]?.id || "");
    if (res.approvers.length === 0) setPinError("No hay administradoras con PIN configurado.");
  }

  function submitPin() {
    setPinError(null);
    if (!approverId) return setPinError("Elige a la administradora que aprueba.");
    startTransition(async () => {
      const res = await approveWithPinAction({ requestId: current.id, approverId, pin: pin.trim(), idempotencyKey: pinKey.current });
      setPin("");
      if (!res.ok) {
        pinKey.current = crypto.randomUUID(); // un PIN nuevo es un intento nuevo
        setPinError(res.message);
        const list = await listApproversAction();
        if (list.ok) setApprovers(list.approvers);
        return;
      }
      setCurrent(res.approval);
    });
  }

  const status = current.status;

  if (status === "APROBADA") {
    return (
      <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950" data-testid="approval-approved">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div>
          <p className="font-medium">
            Aprobado por {current.decidedByName ?? "Belén"}
            {current.method === "PIN" ? " (con PIN, en la tienda)" : ""}.
          </p>
          {current.decisionComment && <p>“{current.decisionComment}”</p>}
          <p className="text-emerald-900/80">Válida una sola vez, {untilText(current.expiresAt)}.</p>
        </div>
      </div>
    );
  }

  if (status !== "PENDIENTE") {
    const text =
      status === "RECHAZADA"
        ? `Belén rechazó la solicitud${current.decisionComment ? `: “${current.decisionComment}”` : "."}`
        : status === "VENCIDA"
          ? "La solicitud venció sin respuesta. Si todavía la necesitas, pide una nueva."
          : "Esta aprobación ya se usó.";
    return (
      <div role="alert" className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950" data-testid={`approval-${status.toLowerCase()}`}>
        <p className="flex items-start gap-2 font-medium">
          <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{text}</span>
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {closeLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="approval-waiting" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Esperando a Belén…
        </p>
        <p className="flex items-center gap-1 text-xs text-amber-900/80">
          <Clock className="size-3.5" aria-hidden /> pedida {ago(current.createdAt)} · {untilText(current.expiresAt)}
        </p>
      </div>
      <p>{current.headline}</p>

      {!pinOpen ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void openPin()}>
            <KeyRound /> Belén está aquí
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
      ) : (
        <form
          className="space-y-2 rounded-lg border bg-card p-3 text-foreground"
          onSubmit={(e) => {
            e.preventDefault();
            submitPin();
          }}
        >
          <p className="text-sm font-medium">Aprobación presencial con PIN</p>
          {approvers.length > 1 && (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Administradora que aprueba">
              {approvers.map((a) => (
                <Button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={approverId === a.id}
                  variant={approverId === a.id ? "default" : "outline"}
                  size="sm"
                  disabled={a.lockedUntil !== null}
                  onClick={() => setApproverId(a.id)}
                >
                  {a.name}
                  {a.lockedUntil ? " (bloqueada)" : ""}
                </Button>
              ))}
            </div>
          )}
          {approvers.length === 1 && <p className="text-sm text-muted-foreground">Aprueba: {approvers[0].name}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              aria-label="PIN de la administradora"
              placeholder="PIN"
              className="h-10 w-32 text-center text-lg tracking-widest"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            />
            <Button type="submit" disabled={pending || pin.length < 4 || !approverId}>
              {pending ? "Verificando…" : "Aprobar con PIN"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => (setPinOpen(false), setPin(""), setPinError(null))}>
              Volver
            </Button>
          </div>
          {demoPinHint && <p className="text-xs text-muted-foreground">DEMO: el PIN de Belén es {demoPinHint}.</p>}
          {pinError && (
            <p role="alert" className={cn("text-sm font-medium text-red-700")} data-testid="pin-error">
              {pinError}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
