import { requirePageAccess } from "@/modules/auth";
import { listApprovals, type ApprovalStatus } from "@/modules/approvals";
import { formatDateTime, formatTimeWithSeconds } from "@/lib/dates";
import { formatCLP } from "@/lib/money";
import { AutoRefresh } from "@/components/stock/auto-refresh";
import { ApprovalCard } from "@/components/approvals/approval-card";
import { TYPE_LABEL } from "@/components/approvals/labels";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS: Record<ApprovalStatus, { label: string; className: string }> = {
  PENDIENTE: { label: "Pendiente", className: "bg-amber-100 text-amber-900" },
  APROBADA: { label: "Aprobada", className: "bg-emerald-100 text-emerald-900" },
  RECHAZADA: { label: "Rechazada", className: "bg-red-100 text-red-900" },
  VENCIDA: { label: "Vencida", className: "bg-zinc-200 text-zinc-800" },
  USADA: { label: "Usada", className: "bg-sky-100 text-sky-900" },
};

// Vista de Belén (RF-AUT-02, RNF-07): pensada para el celular. En la demo se actualiza cada ~3 s (sin push).
export default async function ApprovalsPage() {
  const user = await requirePageAccess(["ADMIN"]);
  const { pending, recent } = await listApprovals({ actor: user });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Aprobaciones</h1>
          <AutoRefresh renderedAt={formatTimeWithSeconds(new Date())} />
        </div>
        <p className="text-sm text-muted-foreground">
          Descuentos y anulaciones que piden las vendedoras. Cada aprobación sirve una sola vez, para ese carrito o esa venta y ese monto.
        </p>
      </div>

      <section aria-labelledby="sec-pendientes" className="space-y-3">
        <h2 id="sec-pendientes" className="flex items-center gap-2 font-medium">
          Pendientes
          <Badge className="bg-brand-black text-brand-pink" data-testid="pending-count">
            {pending.length}
          </Badge>
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-2xl border bg-card px-4 py-10 text-center text-muted-foreground" data-testid="no-pending">
            No hay solicitudes pendientes. Cuando una vendedora pida una aprobación, aparece aquí.
          </p>
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

      <section aria-labelledby="sec-historial" className="space-y-2">
        <h2 id="sec-historial" className="font-medium">
          Últimas decisiones
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay decisiones.</p>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card" data-testid="approval-history">
            {recent.map((r) => (
              <li key={r.id} className="space-y-0.5 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {TYPE_LABEL[r.type] ?? r.type}
                    {r.amount !== null ? ` · ${formatCLP(r.amount)}` : ""}
                  </span>
                  <Badge variant="secondary" className={cn(STATUS[r.status].className)}>
                    {STATUS[r.status].label}
                    {r.status !== "RECHAZADA" && r.method === "PIN" && r.decidedByName ? " · PIN" : ""}
                  </Badge>
                </div>
                <p className="text-muted-foreground">
                  {r.requestedByName} · {r.locationName} · {formatDateTime(r.createdAt)}
                </p>
                <p className="truncate text-muted-foreground">{r.display.headline}</p>
                {r.decisionComment && <p>“{r.decisionComment}”</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
