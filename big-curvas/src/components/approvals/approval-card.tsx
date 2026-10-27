"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, MapPin, UserRound, X } from "lucide-react";
import { approveAction, rejectAction } from "@/app/(app)/aprobaciones/actions";
import { Badge } from "@/components/ui/badge";
import { TYPE_LABEL } from "./labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCLP } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface CardData {
  id: string;
  type: "DESCUENTO_SOBRE_LIMITE" | "ANULACION" | string;
  locationName: string;
  requestedByName: string;
  createdAt: string;
  expiresAt: string | null;
  amount: number | null;
  reason: string;
  headline: string;
  lines: { label: string; value: string }[];
}

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.floor(m / 60)} h`;
}

/**
 * Tarjeta de una solicitud pendiente, pensada para el celular: detalle claro y dos botones grandes. Aprobar o
 * rechazar es un toque; el comentario es opcional. Cada tarjeta usa su propia clave de idempotencia.
 */
export function ApprovalCard({ data }: { data: CardData }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const key = useRef(crypto.randomUUID());

  function decide(kind: "approve" | "reject") {
    setMessage(null);
    startTransition(async () => {
      const payload = { requestId: data.id, comment: comment.trim() || undefined, idempotencyKey: key.current };
      const res = kind === "approve" ? await approveAction(payload) : await rejectAction(payload);
      if (!res.ok) {
        key.current = crypto.randomUUID();
        setMessage(res.message);
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  return (
    <article className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm" data-testid="approval-card" data-type={data.type} aria-label={data.headline}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge className="bg-brand-black text-brand-pink">{TYPE_LABEL[data.type] ?? data.type}</Badge>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden /> pedida {ago(data.createdAt)}
        </span>
      </div>

      <h2 className="text-lg leading-snug font-semibold">{data.headline}</h2>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <UserRound className="size-3.5" aria-hidden /> {data.requestedByName}
        </span>
        <span className="flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden /> {data.locationName}
        </span>
      </div>

      <dl className="space-y-1.5 rounded-xl bg-muted/50 p-3 text-sm">
        {data.lines.map((l, i) => (
          <div key={i} className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-3">
            <dt className="text-muted-foreground">{l.label}</dt>
            <dd className="font-medium sm:text-right">{l.value}</dd>
          </div>
        ))}
        {data.amount !== null && (
          <div className="flex justify-between gap-3 border-t pt-1.5">
            <dt className="text-muted-foreground">Monto</dt>
            <dd className="font-semibold tabular-nums">{formatCLP(data.amount)}</dd>
          </div>
        )}
      </dl>

      <blockquote className="border-l-4 border-brand-pink-strong bg-brand-pink/30 px-3 py-2 text-sm" data-testid="approval-reason">
        <span className="text-xs font-medium text-muted-foreground">Motivo de la vendedora</span>
        <br />“{data.reason}”
      </blockquote>

      <Input
        aria-label="Comentario opcional para la vendedora"
        placeholder="Comentario (opcional)"
        className="h-11 text-base"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      {message && (
        <p role="alert" className={cn("text-sm font-medium text-tone-danger")} data-testid="decision-error">
          {message}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" size="lg" className="h-14 border-tone-danger/30 text-base text-tone-danger hover:bg-tone-danger-soft" disabled={pending} onClick={() => decide("reject")} data-testid="reject">
          <X /> Rechazar
        </Button>
        <Button type="button" size="lg" className="h-14 text-base" disabled={pending} onClick={() => decide("approve")} data-testid="approve">
          <Check /> Aprobar
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {data.expiresAt ? `Vence ${new Date(data.expiresAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" })}` : ""}
      </p>
    </article>
  );
}
