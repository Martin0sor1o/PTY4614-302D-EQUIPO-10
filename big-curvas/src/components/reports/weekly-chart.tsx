import { formatCLP } from "@/lib/money";
import type { SalesByPaymentMethod } from "@/modules/reports";
import { BarList } from "./bar-list";
import { CHANNEL_TEXT, WEEKS_IN_CHART, weekBars } from "./charts";
import { barPercent, pluralize } from "./format";

// La semana en curso va rayada Y rotulada: está incompleta y no se compara de igual a igual.
const FULL = "bg-primary";
const PARTIAL = "bg-[repeating-linear-gradient(135deg,var(--primary)_0_4px,transparent_4px_7px)]";

/** Total cobrado por semana, últimas 8. Recibe el reporte de ese rango agrupado por semana (una sola llamada). */
export function WeeklyChart({ report }: { report: SalesByPaymentMethod }) {
  const bars = weekBars(report);
  const max = Math.max(0, ...bars.map((b) => b.amount));
  return (
    <section aria-labelledby="weeks-title" className="rounded-3xl border bg-card p-4 shadow-soft" data-testid="weekly-chart">
      <h2 id="weeks-title" className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
        Últimas {WEEKS_IN_CHART} semanas
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        <strong className="text-foreground">No dependen del rango de fechas elegido</strong>: son de lunes a domingo, hasta hoy. Sí respetan el canal:{" "}
        {CHANNEL_TEXT[report.channel]}.
      </p>
      <BarList
        label={`Total cobrado por semana, últimas ${WEEKS_IN_CHART} semanas`}
        className="mt-3"
        items={bars.map((b) => ({
          key: b.key,
          label: b.label,
          tag: b.current ? "en curso" : undefined,
          value: formatCLP(b.amount),
          detail: b.count === 0 ? "sin ventas" : pluralize(b.count, "venta", "ventas"),
          width: barPercent(b.amount, max),
          barClass: b.current ? PARTIAL : FULL,
        }))}
      />
      <p className="mt-3 border-t pt-2 text-sm" data-testid="weekly-total">
        Total de las {WEEKS_IN_CHART} semanas: <strong className="tabular-nums">{formatCLP(report.totals.total)}</strong> ·{" "}
        {pluralize(report.totals.count, "venta", "ventas")}
      </p>
    </section>
  );
}
