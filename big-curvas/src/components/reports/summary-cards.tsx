import { formatCLP } from "@/lib/money";
import type { SalesSummaryCards } from "@/modules/reports";
import { dayLabel, pluralize, weekdayLabel } from "./format";

function Card({ title, hint, total, count, testId }: { title: string; hint: string; total: number; count: number; testId: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4" data-testid={testId}>
      <div className="text-sm font-medium text-muted-foreground">{title}</div>
      <div className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums sm:mt-1 sm:text-3xl">{formatCLP(total)}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {count === 0 ? "Sin ventas todavía" : pluralize(count, "venta", "ventas")} · {hint}
      </div>
    </div>
  );
}

/** Ventas de hoy, de la semana y del mes (ambos canales, lo cobrado). Siempre visibles sobre las pestañas. */
export function SummaryCards({ cards }: { cards: SalesSummaryCards }) {
  const { today, week, month, pendingRefunds } = cards;
  return (
    <section aria-label="Resumen de ventas" className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
        <Card title="Hoy" hint={`${weekdayLabel(today.fromDay)} ${dayLabel(today.fromDay)}`} total={today.total} count={today.count} testId="card-today" />
        <Card title="Esta semana" hint={`desde el lunes ${dayLabel(week.fromDay)}`} total={week.total} count={week.count} testId="card-week" />
        <Card title="Este mes" hint={`desde el ${dayLabel(month.fromDay)}`} total={month.total} count={month.count} testId="card-month" />
      </div>
      {pendingRefunds.orders > 0 && (
        <div
          data-testid="card-pending-refunds"
          className="rounded-xl border border-tone-warn/30 bg-tone-warn-soft px-4 py-3 text-sm text-tone-warn"
          role="note"
        >
          <span className="font-semibold">Reembolsos pendientes: {pendingRefunds.orders} · {formatCLP(pendingRefunds.amount)}.</span>{" "}
          Son pedidos cancelados cuya plata aún no se devuelve: siguen sumando en las ventas de arriba hasta que registres el reembolso en
          el pedido.
        </div>
      )}
    </section>
  );
}
