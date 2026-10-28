import { cn } from "@/lib/utils";
import { formatCLP } from "@/lib/money";
import { Notice } from "@/components/ui/notice";
import type { SalesSummaryCards } from "@/modules/reports";
import { dayLabel, pluralize, weekdayLabel } from "./format";

function Card({
  title,
  hint,
  total,
  count,
  testId,
  featured = false,
  className,
}: {
  title: string;
  hint: string;
  total: number;
  count: number;
  testId: string;
  featured?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border p-4 shadow-soft",
        featured ? "border-transparent bg-brand-black text-brand-pink" : "bg-card",
        className,
      )}
      data-testid={testId}
    >
      <div className={cn("text-xs font-bold tracking-wider uppercase", featured ? "text-brand-pink" : "text-muted-foreground")}>{title}</div>
      <div className={cn("mt-1 font-bold tracking-tight tabular-nums", featured ? "text-4xl sm:text-3xl" : "text-2xl sm:text-3xl")}>{formatCLP(total)}</div>
      <div className={cn("mt-1 text-sm", featured ? "text-brand-pink" : "text-muted-foreground")}>
        {count === 0 ? "Sin ventas todavía" : pluralize(count, "venta", "ventas")} · {hint}
      </div>
    </div>
  );
}

/** Ventas de hoy, de la semana y del mes (ambos canales, lo cobrado). Siempre visibles sobre las pestañas. «Hoy» es la que manda. */
export function SummaryCards({ cards }: { cards: SalesSummaryCards }) {
  const { today, week, month, pendingRefunds } = cards;
  return (
    <section aria-label="Resumen de ventas" className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card
          title="Hoy"
          hint={`${weekdayLabel(today.fromDay)} ${dayLabel(today.fromDay)}`}
          total={today.total}
          count={today.count}
          testId="card-today"
          featured
          className="col-span-2 sm:col-span-1"
        />
        <Card title="Esta semana" hint={`desde el lunes ${dayLabel(week.fromDay)}`} total={week.total} count={week.count} testId="card-week" />
        <Card title="Este mes" hint={`desde el ${dayLabel(month.fromDay)}`} total={month.total} count={month.count} testId="card-month" />
      </div>
      {pendingRefunds.orders > 0 && (
        <Notice tone="warn" title={`Reembolsos pendientes: ${pendingRefunds.orders} · ${formatCLP(pendingRefunds.amount)}`} data-testid="card-pending-refunds" role="note">
          Son pedidos cancelados cuya plata aún no se devuelve: siguen sumando en las ventas de arriba hasta que registres el reembolso en el pedido.
        </Notice>
      )}
    </section>
  );
}
