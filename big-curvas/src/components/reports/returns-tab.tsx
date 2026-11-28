import { formatCLP } from "@/lib/money";
import type { ReturnsReport, ReturnsReportRow } from "@/modules/reports";
import { RETURN_REASON_LABEL, type ReturnReasonCode } from "@/modules/returns/client";
import { Assumption } from "@/components/ui/assumption";
import { dayLabel, pluralize } from "./format";
import { Definitions, EmptyState, ResetRangeAction } from "./shared";

function Stat({ label, value, testId, hint }: { label: string; value: string; testId: string; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3 shadow-soft">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums" data-testid={testId}>
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Breakdown({ title, rows, testId, label }: { title: string; rows: ReturnsReportRow[]; testId: string; label?: (r: ReturnsReportRow) => string }) {
  return (
    <section className="rounded-3xl border bg-card p-4 shadow-soft" aria-label={title} data-testid={testId}>
      <h2 className="mb-2 text-base font-bold">{title}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-1 font-medium">{title.replace("Por ", "")}</th>
            <th className="px-1.5 py-1 text-right font-medium">Devol.</th>
            <th className="px-1.5 py-1 text-right font-medium">Unid.</th>
            <th className="px-1.5 py-1 text-right font-medium">Dañadas</th>
            <th className="px-1.5 py-1 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t" data-testid={`${testId}-row`}>
              <td className="py-1.5">{label ? label(r) : r.label}</td>
              <td className="px-1.5 py-1.5 text-right tabular-nums">{r.returns}</td>
              <td className="px-1.5 py-1.5 text-right tabular-nums">{r.units}</td>
              <td className="px-1.5 py-1.5 text-right tabular-nums">{r.damagedUnits}</td>
              <td className="px-1.5 py-1.5 text-right font-semibold tabular-nums">{formatCLP(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Reporte de devoluciones y cambios (solo ADMIN, solo lectura): por motivo, por ubicación y por destino. */
export function ReturnsTab({ report, resetHref }: { report: ReturnsReport; resetHref?: string }) {
  if (report.totalReturns === 0) {
    return <EmptyState title="No hay devoluciones ni cambios en este rango" action={resetHref ? <ResetRangeAction href={resetHref} /> : null}>Prueba con otras fechas. Aquí aparecen por motivo, por ubicación y por destino (dinero, vale o cambio).</EmptyState>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground" data-testid="returns-summary">
        {dayLabel(report.from)} al {dayLabel(report.to)} · {pluralize(report.totalReturns, "devolución o cambio", "devoluciones y cambios")} · {pluralize(report.totalUnits, "unidad", "unidades")} ·{" "}
        {formatCLP(report.valueReturned)}
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Valor devuelto" value={formatCLP(report.valueReturned)} testId="returns-value" />
        <Stat label="Reembolsado en dinero" value={formatCLP(report.refundedMoney)} testId="returns-money" hint="Efectivo ya redondeado" />
        <Stat label="Ventas del rango" value={formatCLP(report.grossSales)} testId="returns-gross" hint="Todos los medios, con vales" />
        <Stat label="Ventas netas" value={formatCLP(report.netSales)} testId="returns-net" hint="Ventas − valor devuelto" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Breakdown title="Por motivo" rows={report.byReason} testId="returns-by-reason" label={(r) => RETURN_REASON_LABEL[r.key as ReturnReasonCode] ?? r.label} />
        <Breakdown title="Por ubicación" rows={report.byLocation} testId="returns-by-location" />
        <Breakdown title="Por destino" rows={report.byDestination} testId="returns-by-destination" />
      </div>
      <Definitions>
        <li>Cuenta las devoluciones y cambios hechos en el rango (hora de Chile), de cualquier ubicación.</li>
        <li>Valor devuelto = lo pagado por las prendas (con el descuento de su línea, sin envío) <Assumption id="S-04" />.</li>
        <li>Dañadas = unidades que entraron y salieron como merma <Assumption id="S-03" />.</li>
        <li>Ventas netas = lo cobrado por las ventas del rango (vales incluidos) menos el valor devuelto en el mismo rango.</li>
      </Definitions>
    </div>
  );
}
