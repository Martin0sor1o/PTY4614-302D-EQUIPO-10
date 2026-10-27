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
        <div className="rounded-xl border bg-card">
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
                    <div className="text-[11px] text-muted-foreground">
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
