import type { Metadata } from "next";
import { CheckCheck, CircleCheck, CircleX, Clock, ShieldCheck, TimerOff, type LucideIcon } from "lucide-react";
import { requirePageAccess } from "@/modules/auth";
import { listApprovals, type ApprovalStatus } from "@/modules/approvals";
import { formatDateTime, formatTimeWithSeconds } from "@/lib/dates";
import { formatCLP } from "@/lib/money";
import { AutoRefresh } from "@/components/stock/auto-refresh";
import { ApprovalCard } from "@/components/approvals/approval-card";
import { TYPE_LABEL } from "@/components/approvals/labels";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

export const dynamic = "force-dynamic";

// Estado de cada solicitud: siempre color + ícono + texto (nunca solo color).
const STATUS: Record<ApprovalStatus, { label: string; tone: StatusTone; icon: LucideIcon }> = {
  PENDIENTE: { label: "Pendiente", tone: "warn", icon: Clock },
  APROBADA: { label: "Aprobada", tone: "ok", icon: CircleCheck },
  RECHAZADA: { label: "Rechazada", tone: "danger", icon: CircleX },
  VENCIDA: { label: "Vencida", tone: "neutral", icon: TimerOff },
  USADA: { label: "Usada", tone: "info", icon: CheckCheck },
};

// Vista de Belén (RF-AUT-02, RNF-07): pensada para el celular. En la demo se actualiza cada ~3 s (sin push).
export const metadata: Metadata = { title: "Aprobaciones" };

export default async function ApprovalsPage() {
  const user = await requirePageAccess(["ADMIN"]);
  const { pending, recent } = await listApprovals({ actor: user });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Aprobaciones</h1>
          <AutoRefresh renderedAt={formatTimeWithSeconds(new Date())} />
        </div>
        <p className="text-sm text-muted-foreground">
          Descuentos y anulaciones que piden las vendedoras. Cada aprobación sirve una sola vez, para ese carrito o esa venta y ese monto.
        </p>
      </div>

      <section aria-labelledby="sec-pendientes" className="space-y-3">
        <h2 id="sec-pendientes" className="flex items-center gap-2 text-lg font-bold">
          Pendientes
          <span
            className="inline-flex min-w-6 items-center justify-center rounded-full bg-brand-black px-2 text-xs leading-6 font-bold text-brand-pink"
            data-testid="pending-count"
          >
            {pending.length}
          </span>
        </h2>
        {pending.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed bg-card px-4 py-10 text-center" data-testid="no-pending">
            <span aria-hidden className="grid size-12 place-items-center rounded-full bg-brand-black text-brand-pink">
              <ShieldCheck className="size-6" />
            </span>
            <p className="text-lg font-bold">Todo al día</p>
            <p className="max-w-sm text-sm text-muted-foreground">No hay solicitudes pendientes. Cuando una vendedora pida una aprobación, aparece aquí.</p>
          </div>
        ) : (
          pending.map((p) => (
            <ApprovalCard
              key={p.id}
              data={{
                id: p.id,
                type: p.type,
                locationName: p.locationName,
                requestedByName: p.requestedByName,
                createdAt: p.createdAt.toISOString(),
                expiresAt: p.expiresAt?.toISOString() ?? null,
                amount: p.amount,
                reason: p.reason,
                headline: p.display.headline,
                lines: p.display.lines,
              }}
            />
          ))
        )}
      </section>

      <section aria-labelledby="sec-historial" className="space-y-3">
        <h2 id="sec-historial" className="text-lg font-bold">
          Últimas decisiones
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay decisiones.</p>
        ) : (
          <ul className="space-y-2" data-testid="approval-history">
            {recent.map((r) => {
              const s = STATUS[r.status];
              return (
                <li key={r.id} className="space-y-1.5 rounded-2xl border bg-card px-4 py-3 text-sm shadow-soft">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{TYPE_LABEL[r.type] ?? r.type}</span>
                    <StatusBadge tone={s.tone} icon={s.icon}>
                      {s.label}
                      {r.status !== "RECHAZADA" && r.method === "PIN" && r.decidedByName ? " · PIN" : ""}
                    </StatusBadge>
                  </div>
                  {r.amount !== null && <div className="text-xl font-bold tabular-nums">{formatCLP(r.amount)}</div>}
                  <p className="text-muted-foreground">
                    {r.requestedByName} · {r.locationName} · {formatDateTime(r.createdAt)}
                  </p>
                  <p className="truncate text-muted-foreground">{r.display.headline}</p>
                  {r.decisionComment && <p className="border-l-4 border-primary/40 pl-3">“{r.decisionComment}”</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
