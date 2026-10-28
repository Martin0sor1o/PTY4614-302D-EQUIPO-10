import type { NoRotation } from "@/modules/reports";
import { formatDate } from "@/lib/dates";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dayLabel, pluralize } from "./format";
import { Definitions, EmptyState } from "./shared";

export function NoRotationTab({ report }: { report: NoRotation }) {
  const { rows } = report;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground" data-testid="no-rotation-summary">
        Prendas con stock que no se venden desde el {dayLabel(report.sinceDay)} ({report.days} días, contando hoy) ·{" "}
        {pluralize(rows.length, "variante", "variantes")}.
      </p>
      {rows.length === 0 ? (
        <EmptyState title="Todo lo que tiene stock se vendió en este período">Si quieres ser más exigente, baja los días en la configuración.</EmptyState>
      ) : (
        <>
          <ul className="space-y-3 sm:hidden" aria-label="Variantes sin rotación">
            {rows.map((r) => (
              <li key={r.variantId} className="rounded-2xl border bg-card p-3 shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{r.productName}</div>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-mono">{r.sku}</span> · {r.color} · talla {r.size}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Stock</div>
                    <div className="text-xl leading-none font-bold tabular-nums">{r.totalOnHand}</div>
                  </div>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {r.byLocation.map((l) => `${l.name.replace(/^Tienda\s+/i, "")} ${l.onHand}`).join(" · ")}
                </div>
                <div className="mt-1 text-sm">
                  {r.lastSaleAt ? (
                    <>
                      Última venta {formatDate(r.lastSaleAt)} · <span className="text-muted-foreground">hace {pluralize(r.daysSinceLastSale ?? 0, "día", "días")}</span>
                    </>
                  ) : (
                    <span className="font-semibold">Nunca vendida</span>
                  )}
                </div>
              </li>
            ))}
          </ul>

        <div className="hidden rounded-3xl border bg-card shadow-soft sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prenda</TableHead>
                <TableHead className="text-center">Talla</TableHead>
                <TableHead className="text-center">Stock</TableHead>
                <TableHead>Última venta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.variantId} data-testid="no-rotation-row">
                  <TableCell>
                    <div className="font-medium">{r.productName}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{r.sku}</span> · {r.color}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{r.size}</TableCell>
                  <TableCell className="text-center">
                    <div className="font-semibold tabular-nums">{r.totalOnHand}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.byLocation.map((l) => `${l.name.replace(/^Tienda\s+/i, "")} ${l.onHand}`).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.lastSaleAt ? (
                      <>
                        <div>{formatDate(r.lastSaleAt)}</div>
                        <div className="text-xs text-muted-foreground">hace {pluralize(r.daysSinceLastSale ?? 0, "día", "días")}</div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Nunca vendida</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </>
      )}

      <Definitions>
        <li>Sin rotación = hay unidades en mano en alguna ubicación y no hubo ventas en los últimos {report.days} días (la cantidad de días está en la configuración; propuesta: 60).</li>
        <li>
          Supuesto: <strong>no se excluyen las prendas recién ingresadas</strong>. Una prenda que llegó ayer y aún no se vende aparece aquí. En la demo todos los ingresos tienen fecha de hoy.
        </li>
        <li>Cuentan ventas de tienda y online. No cuentan las anuladas ni las de pedidos cancelados. Orden: nunca vendidas primero, luego las de más días sin venta.</li>
      </Definitions>
    </div>
  );
}
