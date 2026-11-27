import Link from "next/link";
import { AlertTriangle, Loader2, RotateCcw, Search } from "lucide-react";
import { formatTime } from "@/lib/dates";
import { formatCLP } from "@/lib/money";
import { OTHER_USER_MESSAGE, type AttemptSummary } from "@/lib/pending-attempt";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

// Reemplaza a la caja mientras no se sabe si un cobro, una devolución o un cambio quedó registrado. No hay nada editable:
// solo "Verificar" (consulta) y "Reintentar" (el mismo envío guardado). Así no se puede cobrar un contenido distinto.

const WORDS: Record<AttemptSummary["operation"], { title: string; check: string }> = {
  venta: { title: "No pudimos confirmar el cobro", check: "Verificar si la venta ya se registró" },
  devolucion: { title: "No pudimos confirmar la devolución", check: "Verificar si la devolución ya se registró" },
  cambio: { title: "No pudimos confirmar el cambio", check: "Verificar si el cambio ya se registró" },
};

export const VOUCHER_REMOVED_MESSAGE =
  "Se cerró la sesión y se borró el código del vale: este envío ya no se puede repetir. Verifica si quedó registrado.";

export interface UnconfirmedPanelProps {
  summary: AttemptSummary;
  /** Cuándo se envió (ISO). */
  sentAt: string | null;
  busy: "reintentando" | "verificando" | null;
  /** Qué respondió el último envío, reintento o verificación. */
  message: string | null;
  /** Quien está en la caja es quien hizo el envío. */
  sameUser: boolean;
  voucherRemoved: boolean;
  onRetry: () => void;
  onVerify: () => void;
}

export function UnconfirmedPanel({ summary, sentAt, busy, message, sameUser, voucherRemoved, onRetry, onVerify }: UnconfirmedPanelProps) {
  const words = WORDS[summary.operation];
  const blockedRetry = voucherRemoved ? VOUCHER_REMOVED_MESSAGE : !sameUser ? OTHER_USER_MESSAGE : null;
  return (
    <section className="mx-auto w-full max-w-xl space-y-3 rounded-3xl border border-tone-warn/40 bg-card p-4 shadow-soft" aria-labelledby="unconfirmed-title" data-testid="unconfirmed-panel">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-1 size-5 shrink-0 text-tone-warn" aria-hidden />
        <div role="alert">
          <h2 id="unconfirmed-title" className="text-lg font-bold">
            {words.title}
          </h2>
          <p className="text-sm text-muted-foreground">No sabemos si quedó registrado. Hasta saberlo, no se puede cambiar nada ni empezar otra operación aquí.</p>
        </div>
      </div>

      <div className="space-y-1 rounded-2xl border bg-secondary/40 p-3 text-sm">
        <p className="font-medium">Lo que se envió{sentAt ? ` a las ${formatTime(new Date(sentAt))}` : ""}</p>
        <ul>
          {summary.lines.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ul>
        <p>{summary.payment}</p>
        {summary.voucher && <p>{summary.voucher}</p>}
        <p className="flex justify-between gap-3 border-t pt-1 font-semibold">
          <span>{summary.amountLabel}</span>
          <span className="tabular-nums">{formatCLP(summary.amount)}</span>
        </p>
      </div>

      <div role="status" aria-live="polite">
        {message && (
          <Notice tone="warn" className="py-2" data-testid="unconfirmed-message">
            {message}
          </Notice>
        )}
      </div>

      {blockedRetry && <p className="text-sm font-medium text-tone-warn">{blockedRetry}</p>}

      <div className="grid gap-2">
        <Button type="button" size="lg" className="h-12 text-base" disabled={busy !== null || blockedRetry !== null} onClick={onRetry} data-testid="retry-attempt">
          {busy === "reintentando" ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
          {busy === "reintentando" ? "Reintentando…" : "Reintentar"}
        </Button>
        <Button type="button" variant="outline" size="lg" className="h-12 whitespace-normal" disabled={busy !== null} onClick={onVerify} data-testid="verify-attempt">
          {busy === "verificando" ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
          {busy === "verificando" ? "Verificando…" : words.check}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">“Reintentar” envía exactamente lo mismo: si ya estaba registrado, se muestra y no se repite.</p>
      <p className="text-xs text-muted-foreground">
        Si no logras salir de esta pantalla: cierra la pestaña y, antes de repetir la operación, revisa las{" "}
        <Link href="/pos/ventas" className="font-medium underline">
          ventas del día
        </Link>
        {summary.operation === "venta" ? "." : " y, en Cambio / Devolución, cuántas prendas de la venta original figuran como devueltas."}
      </p>
    </section>
  );
}
