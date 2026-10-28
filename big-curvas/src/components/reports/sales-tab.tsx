import { formatCLP } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { SalesByPaymentMethod } from "@/modules/reports";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { barPercent, pluralize, periodLabel } from "./format";
import { Definitions, EmptyState } from "./shared";

const METHODS = [
  { key: "efectivo", label: "Efectivo", bar: "bg-brand-black" },
  { key: "tarjeta", label: "Tarjeta", bar: "bg-brand-pink-strong" },
  { key: "transferencia", label: "Transferencia", bar: "bg-brand-pink" },
] as const;

const PERIOD_HEAD = { day: "Día", week: "Semana", month: "Mes" } as const;

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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="sales-totals">
            <div className="rounded-xl border bg-card p-4">
              <div className="text-sm font-medium text-muted-foreground">Total cobrado</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{formatCLP(totals.total)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{pluralize(totals.count, "venta", "ventas")}</div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="text-sm font-medium text-muted-foreground">Ticket promedio</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{formatCLP(totals.averageTicket)}</div>
              <div className="mt-1 text-xs text-muted-foreground">por venta</div>
            </div>
            <div className="rounded-xl border bg-card p-4 sm:col-span-2">
              <div className="text-sm font-medium text-muted-foreground">Por medio de pago</div>
              <ul className="mt-2 space-y-1.5">
                {METHODS.map((m) => (
                  <li key={m.key} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-sm">
                    <span>{m.label}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span className={cn("block h-full rounded-full", m.bar)} style={{ width: `${barPercent(totals[m.key], totals.total)}%` }} />
                    </span>
                    <span className="font-medium tabular-nums">{formatCLP(totals[m.key])}</span>
                  </li>
                ))}
              </ul>
              {totals.tarjeta > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Tarjeta = débito {formatCLP(totals.debito)} + crédito {formatCLP(totals.credito)}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{PERIOD_HEAD[groupBy]}</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Efectivo</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Tarjeta</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Transfer.</TableHead>
                  {hasOthers && <TableHead className="hidden text-right sm:table-cell">Otros</TableHead>}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Ticket prom.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key} className={cn(r.count === 0 && "text-muted-foreground")} data-testid="sales-row">
                    <TableCell>
                      <div className="whitespace-nowrap font-medium">{periodLabel(r, groupBy)}</div>
                      {r.total > 0 && (
                        <div className="mt-1 h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <div className="h-full rounded-full bg-brand-pink-strong" style={{ width: `${barPercent(r.total, maxTotal)}%` }} />
                        </div>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground sm:hidden">
                        Efec. {formatCLP(r.efectivo)} · Tarj. {formatCLP(r.tarjeta)} · Transf. {formatCLP(r.transferencia)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatCLP(r.efectivo)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatCLP(r.tarjeta)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatCLP(r.transferencia)}</TableCell>
                    {hasOthers && <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatCLP(r.otros)}</TableCell>}
                    <TableCell className="text-right font-semibold tabular-nums">{formatCLP(r.total)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{r.count > 0 ? formatCLP(r.averageTicket) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.count}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatCLP(totals.efectivo)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatCLP(totals.tarjeta)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatCLP(totals.transferencia)}</TableCell>
                  {hasOthers && <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatCLP(totals.otros)}</TableCell>}
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
