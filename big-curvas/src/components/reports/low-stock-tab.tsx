import { PackageX } from "lucide-react";
import type { LowStock } from "@/modules/reports";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pluralize } from "./format";
import { Definitions, EmptyState } from "./shared";

type Row = LowStock["locations"][number]["rows"][number];

/** Disponible con su estado: «Agotado» o el número con «Bajo» (nunca solo color). */
function Available({ r }: { r: Row }) {
  return r.available === 0 ? (
    <StatusBadge tone="danger" icon={PackageX}>
      Agotado
    </StatusBadge>
  ) : (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-base font-bold tabular-nums">{r.available}</span>
      <StatusBadge tone="warn">Bajo</StatusBadge>
    </span>
  );
}

export function LowStockTab({ report }: { report: LowStock }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground" data-testid="low-stock-threshold">
        Variantes con {report.threshold} {report.threshold === 1 ? "unidad disponible" : "unidades disponibles"} o menos (en mano − reservadas), por ubicación.
      </p>
      {report.locations.map((loc) => (
        <section key={loc.locationId} aria-label={loc.name} data-testid={`low-stock-${loc.code}`} className="space-y-2">
          <h2 className="text-lg font-bold">
            {loc.name} <span className="text-sm font-normal text-muted-foreground">· {pluralize(loc.rows.length, "variante", "variantes")}</span>
          </h2>
          {loc.rows.length === 0 ? (
            <EmptyState title={`Nada con stock bajo en ${loc.name}`}>Todas las variantes tienen más del umbral disponible.</EmptyState>
          ) : (
            <>
              <ul className="space-y-3 sm:hidden" aria-label={`Stock bajo en ${loc.name}`}>
                {loc.rows.map((r) => (
                  <li key={r.variantId} className="rounded-2xl border bg-card p-3 shadow-soft">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold">{r.productName}</div>
                        <div className="text-sm text-muted-foreground">
                          <span className="font-mono">{r.sku}</span> · {r.color} · talla {r.size}
                          {r.ownThreshold && ` · umbral propio ${r.threshold}`}
                        </div>
                      </div>
                      <Available r={r} />
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      En mano {r.onHand} · reservado {r.reserved}
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
                      <TableHead className="text-center">Disponible</TableHead>
                      <TableHead className="text-center">En mano</TableHead>
                      <TableHead className="text-center">Reservado</TableHead>
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
                        </TableCell>
                        <TableCell className="text-center">{r.size}</TableCell>
                        <TableCell className="text-center">
                          <Available r={r} />
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{r.onHand}</TableCell>
                        <TableCell className="text-center tabular-nums">
                          {r.reserved > 0 ? <span className="font-semibold">{r.reserved}</span> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
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
