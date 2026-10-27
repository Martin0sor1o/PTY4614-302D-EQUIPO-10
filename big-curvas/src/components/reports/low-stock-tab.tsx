import { cn } from "@/lib/utils";
import type { LowStock } from "@/modules/reports";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pluralize } from "./format";
import { Definitions, EmptyState } from "./shared";

export function LowStockTab({ report }: { report: LowStock }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground" data-testid="low-stock-threshold">
        Variantes con {report.threshold} {report.threshold === 1 ? "unidad disponible" : "unidades disponibles"} o menos (en mano − reservadas), por ubicación.
      </p>
      {report.locations.map((loc) => (
        <section key={loc.locationId} aria-label={loc.name} data-testid={`low-stock-${loc.code}`} className="space-y-2">
          <h2 className="text-lg font-semibold">
            {loc.name} <span className="text-sm font-normal text-muted-foreground">· {pluralize(loc.rows.length, "variante", "variantes")}</span>
          </h2>
          {loc.rows.length === 0 ? (
            <EmptyState title={`Nada con stock bajo en ${loc.name}`}>Todas las variantes tienen más del umbral disponible.</EmptyState>
          ) : (
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prenda</TableHead>
                    <TableHead className="text-center">Talla</TableHead>
                    <TableHead className="text-center">Disponible</TableHead>
                    <TableHead className="hidden text-center sm:table-cell">En mano</TableHead>
                    <TableHead className="hidden text-center sm:table-cell">Reservado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loc.rows.map((r) => (
                    <TableRow key={r.variantId} data-testid="low-stock-row">
                      <TableCell>
                        <div className="font-medium">{r.productName}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{r.sku}</span> · {r.color}
                          {r.ownThreshold && ` · umbral propio ${r.threshold}`}
                        </div>
                        <div className="text-[11px] text-muted-foreground sm:hidden">
                          En mano {r.onHand} · reservado {r.reserved}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{r.size}</TableCell>
                      <TableCell className="text-center">
                        {r.available === 0 ? (
                          <Badge variant="destructive">Agotado</Badge>
                        ) : (
                          <span className={cn("text-base font-semibold tabular-nums text-amber-700")}>{r.available}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-center tabular-nums sm:table-cell">{r.onHand}</TableCell>
                      <TableCell className="hidden text-center tabular-nums sm:table-cell">
                        {r.reserved > 0 ? <span className="text-violet-700">{r.reserved}</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      ))}

      <Definitions>
        <li>Disponible = en mano − reservado para pedidos. “Bajo” incluye el umbral exacto (con 2: dos o menos) y las agotadas (0).</li>
        <li>El umbral general está en la configuración (propuesta: 2). Un producto puede tener el suyo, y entonces manda ese.</li>
        <li>Solo aparecen variantes que ya tuvieron stock en esa ubicación.</li>
      </Definitions>
    </div>
  );
}
