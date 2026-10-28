"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, MapPin, UserRound, X } from "lucide-react";
import { approveAction, rejectAction } from "@/app/(app)/aprobaciones/actions";
import { TYPE_LABEL } from "./labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatTime } from "@/lib/dates";
import { formatCLP } from "@/lib/money";

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
 * Tarjeta de una solicitud pendiente, pensada para el celular: el monto y el detalle primero y dos botones grandes,
 * separados entre sí. Aprobar o rechazar es un toque; el comentario es opcional. Cada tarjeta usa su propia clave de idempotencia.
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
    <article
      className="space-y-4 rounded-3xl border-2 border-primary/25 bg-card p-4 shadow-soft"
      data-testid="approval-card"
      data-type={data.type}
      aria-label={data.headline}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-brand-black px-3 py-1 text-xs font-bold tracking-wide text-brand-pink">{TYPE_LABEL[data.type] ?? data.type}</span>
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          <Clock className="size-4" aria-hidden /> pedida {ago(data.createdAt)}
        </span>
      </div>

      {data.amount !== null && (
        <div>
          <div className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Monto</div>
          <div className="text-4xl leading-tight font-bold tabular-nums">{formatCLP(data.amount)}</div>
        </div>
      )}

      <h2 className="text-lg leading-snug font-bold">{data.headline}</h2>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <UserRound className="size-4" aria-hidden /> {data.requestedByName}
        </span>
        <span className="flex items-center gap-1">
          <MapPin className="size-4" aria-hidden /> {data.locationName}
        </span>
      </div>

      {data.lines.length > 0 && (
        <dl className="space-y-1.5 rounded-2xl bg-secondary p-3 text-sm">
          {data.lines.map((l, i) => (
            <div key={i} className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-3">
              <dt className="text-muted-foreground">{l.label}</dt>
              <dd className="font-semibold sm:text-right">{l.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <blockquote className="rounded-2xl border-l-4 border-primary bg-secondary px-3 py-2 text-sm" data-testid="approval-reason">
        <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Motivo de la vendedora</span>
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
        <Notice tone="danger" role="alert" data-testid="decision-error">
          {message}
        </Notice>
      )}

      {/* Dos botones grandes y bien separados (16 px) para no tocar el equivocado. */}
      <div className="grid grid-cols-2 gap-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-14 border-tone-danger text-base text-tone-danger hover:bg-tone-danger-soft hover:text-tone-danger max-md:h-14"
          disabled={pending}
          onClick={() => decide("reject")}
          data-testid="reject"
        >
          <X /> Rechazar
        </Button>
        <Button type="button" size="lg" className="h-14 text-base max-md:h-14" disabled={pending} onClick={() => decide("approve")} data-testid="approve">
          <Check /> Aprobar
        </Button>
      </div>

      {data.expiresAt && (
        <div className="flex justify-center">
          <StatusBadge tone="neutral" icon={Clock}>
            Vence a las {formatTime(new Date(data.expiresAt))}
          </StatusBadge>
        </div>
      )}
    </article>
  );
}
