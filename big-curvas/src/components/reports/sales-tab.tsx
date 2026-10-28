import { formatCLP } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { SalesByPaymentMethod, SalesPeriodRow } from "@/modules/reports";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { barPercent, pluralize, periodLabel } from "./format";
import { Definitions, EmptyState } from "./shared";

// Los tres medios se distinguen por color Y por rótulo, monto y porcentaje (la barra nunca es lo único que informa).
const METHODS = [
  { key: "efectivo", label: "Efectivo", bar: "bg-brand-black" },
  { key: "tarjeta", label: "Tarjeta", bar: "bg-primary" },
  { key: "transferencia", label: "Transferencia", bar: "bg-input" },
] as const;

const PERIOD_HEAD = { day: "Día", week: "Semana", month: "Mes" } as const;

const percent = (value: number, total: number) => (total > 0 ? Math.round((100 * value) / total) : 0);

/** Celular (bajo sm): una tarjeta por período, con el total a la vista y el desglose por medio de pago. */
function PeriodCard({ r, groupBy, maxTotal, hasOthers }: { r: SalesPeriodRow; groupBy: SalesByPaymentMethod["groupBy"]; maxTotal: number; hasOthers: boolean }) {
  return (
    <li className={cn("rounded-2xl border bg-card p-3 shadow-soft", r.count === 0 && "text-muted-foreground")}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-semibold">{periodLabel(r, groupBy)}</div>
        <div className="text-xl font-bold tabular-nums">{formatCLP(r.total)}</div>
      </div>
      <div className="text-sm text-muted-foreground">
        {r.count === 0 ? "Sin ventas" : `${pluralize(r.count, "venta", "ventas")} · ticket ${formatCLP(r.averageTicket)}`}
      </div>
      {r.total > 0 && (
        <>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${barPercent(r.total, maxTotal)}%` }} />
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Efectivo</dt>
              <dd className="font-semibold tabular-nums">{formatCLP(r.efectivo)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Tarjeta</dt>
              <dd className="font-semibold tabular-nums">{formatCLP(r.tarjeta)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Transf.</dt>
              <dd className="font-semibold tabular-nums">{formatCLP(r.transferencia)}</dd>
            </div>
            {hasOthers && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Otros</dt>
                <dd className="font-semibold tabular-nums">{formatCLP(r.otros)}</dd>
              </div>
            )}
          </dl>
        </>
      )}
    </li>
  );
}

export function SalesTab({ report }: { report: SalesByPaymentMethod }) {
  const { rows, totals, voided, pendingRefunds, groupBy } = report;
  const maxTotal = Math.max(0, ...rows.map((r) => r.total));
  const hasOthers = totals.otros > 0;

  return (
    <div className="space-y-4">
      {totals.count === 0 ? (
        <EmptyState title="No hay ventas en este rango">
          Prueba con otras fechas o con “Tienda y online”. Las ventas anuladas no se cuentan.
        </EmptyState>
      ) : (
        <>
          <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="sales-totals">
            <div className="rounded-3xl border bg-card p-4 shadow-soft">
              <div className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Total cobrado</div>
              <div className="mt-1 text-3xl font-bold tabular-nums">{formatCLP(totals.total)}</div>
              <div className="mt-1 text-sm text-muted-foreground">{pluralize(totals.count, "venta", "ventas")}</div>
            </div>
            <div className="rounded-3xl border bg-card p-4 shadow-soft">
              <div className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Ticket promedio</div>
              <div className="mt-1 text-3xl font-bold tabular-nums">{formatCLP(totals.averageTicket)}</div>
              <div className="mt-1 text-sm text-muted-foreground">por venta</div>
            </div>
            <div className="rounded-3xl border bg-card p-4 shadow-soft sm:col-span-2">
              <div className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Por medio de pago</div>
              <ul className="mt-3 space-y-3">
                {METHODS.map((m) => (
                  <li key={m.key} className="space-y-1 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-2 font-semibold">
                        <span aria-hidden className={cn("size-3 rounded-full", m.bar)} />
                        {m.label}
                      </span>
                      <span className="tabular-nums">
                        <span className="font-bold">{formatCLP(totals[m.key])}</span>
                        <span className="text-muted-foreground"> · {percent(totals[m.key], totals.total)} %</span>
                      </span>
                    </div>
                    <span className="block h-3 overflow-hidden rounded-full bg-secondary" aria-hidden>
                      <span className={cn("block h-full rounded-full", m.bar)} style={{ width: `${barPercent(totals[m.key], totals.total)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
              {totals.tarjeta > 0 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Tarjeta = débito {formatCLP(totals.debito)} + crédito {formatCLP(totals.credito)}
                </p>
              )}
            </div>
          </div>

          <ul className="space-y-3 sm:hidden" aria-label={PERIOD_HEAD[groupBy]}>
            {rows.map((r) => (
              <PeriodCard key={r.key} r={r} groupBy={groupBy} maxTotal={maxTotal} hasOthers={hasOthers} />
            ))}
          </ul>

          <div className="hidden rounded-3xl border bg-card shadow-soft sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{PERIOD_HEAD[groupBy]}</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Efectivo</TableHead>
                  <TableHead className="text-right">Tarjeta</TableHead>
                  <TableHead className="text-right">Transfer.</TableHead>
                  {hasOthers && <TableHead className="text-right">Otros</TableHead>}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Ticket prom.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key} className={cn(r.count === 0 && "text-muted-foreground")} data-testid="sales-row">
                    <TableCell>
                      <div className="font-medium whitespace-nowrap">{periodLabel(r, groupBy)}</div>
                      {r.total > 0 && (
                        <div className="mt-1 h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-secondary" aria-hidden>
                          <div className="h-full rounded-full bg-primary" style={{ width: `${barPercent(r.total, maxTotal)}%` }} />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(r.efectivo)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(r.tarjeta)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(r.transferencia)}</TableCell>
                    {hasOthers && <TableCell className="text-right tabular-nums">{formatCLP(r.otros)}</TableCell>}
                    <TableCell className="text-right font-bold tabular-nums">{formatCLP(r.total)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{r.count > 0 ? formatCLP(r.averageTicket) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.count}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCLP(totals.efectivo)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCLP(totals.tarjeta)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCLP(totals.transferencia)}</TableCell>
                  {hasOthers && <TableCell className="text-right tabular-nums">{formatCLP(totals.otros)}</TableCell>}
                  <TableCell className="text-right tabular-nums">{formatCLP(totals.total)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{formatCLP(totals.averageTicket)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </>
      )}

      {(voided.count > 0 || pendingRefunds.orders > 0) && (
        <ul className="space-y-1 text-sm text-muted-foreground" data-testid="sales-notes">
          {voided.count > 0 && (
            <li>
              Anuladas en este rango (no suman): {pluralize(voided.count, "venta", "ventas")} · {formatCLP(voided.total)}.
            </li>
          )}
          {pendingRefunds.orders > 0 && (
            <li>
              Reembolsos pendientes (sí suman hasta registrar el reembolso): {pluralize(pendingRefunds.orders, "pedido", "pedidos")} ·{" "}
              {formatCLP(pendingRefunds.amount)}.
            </li>
          )}
        </ul>
      )}

      <Definitions>
        <li>Se cuenta lo cobrado (suma de los pagos). En efectivo incluye el redondeo a $10 y, en pedidos online, el envío cobrado.</li>
        <li>La venta online cuenta el día en que se confirma el pago. Los días van de 00:00 a 23:59 hora de Chile.</li>
        <li>Una venta anulada o reembolsada no suma, y desaparece del día en que se hizo (aunque se anule días después).</li>
        <li>Semana: lunes a domingo. Si el rango corta una semana o un mes, se muestra solo la parte incluida.</li>
        <li>Tarjeta = débito + crédito. Ticket promedio = total ÷ ventas.</li>
      </Definitions>
    </div>
  );
}
