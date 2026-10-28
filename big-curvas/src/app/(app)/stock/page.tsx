import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, PackageX } from "lucide-react";
import { z } from "zod";
import { requirePageAccess } from "@/modules/auth";
import { cellFor, getStockMatrix, type StockCell } from "@/modules/inventory";
import { listLocations } from "@/modules/locations";
import { formatTimeWithSeconds } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "@/components/stock/auto-refresh";
import { StockSearch } from "@/components/stock/stock-search";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const searchSchema = z.object({ q: z.string().trim().max(100).optional().catch(undefined) });

/** Encabezado de columna: el nombre de la ubicación sin el prefijo "Tienda ". */
const shortName = (name: string) => name.replace(/^Tienda\s+/i, "");

function StockCellView({ cell, threshold }: { cell: StockCell; threshold: number | null }) {
  const low = cell.available > 0 && threshold !== null && cell.available <= threshold;
  return (
    <div title={`Físico ${cell.onHand} · Reservado ${cell.reserved} · Disponible ${cell.available}`} className="leading-tight">
      <div className="flex items-center justify-center gap-1.5">
        <span className={cn("text-base font-bold tabular-nums", cell.available === 0 && "font-normal text-muted-foreground")}>
          {cell.available}
        </span>
        {low && (
          <StatusBadge tone="warn" className="px-1.5 py-0 text-[11px] leading-4">
            Bajo
          </StatusBadge>
        )}
      </div>
      {cell.reserved > 0 && (
        <div className="text-[11px] text-muted-foreground">
          de {cell.onHand} · <span className="font-semibold text-tone-violet">{cell.reserved} res.</span>
        </div>
      )}
    </div>
  );
}

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage({ searchParams }: PageProps<"/stock">) {
  const user = await requirePageAccess(["ADMIN", "VENDEDORA", "BODEGA"]);
  const { q } = searchSchema.parse(await searchParams);
  const [locations, rows] = await Promise.all([listLocations(), getStockMatrix({ search: q })]);
  const myLocationId = user.location?.id ?? user.activeLocation?.id;
  // "Por resolver" aparece solo si hay faltantes de traslados sin resolver entre las prendas mostradas.
  const showPending = rows.some((r) => r.pendingResolution > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock</h1>
          <p className="text-sm text-muted-foreground">
            Disponible por ubicación (físico − reservado para pedidos). Las demás ubicaciones son solo de consulta.
          </p>
        </div>
        <AutoRefresh renderedAt={formatTimeWithSeconds(new Date())} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StockSearch initial={q ?? ""} />
        <p className="text-sm text-muted-foreground" data-testid="stock-count">
          {rows.length} {rows.length === 1 ? "variante" : "variantes"}
          {q ? ` para “${q}”` : ""}
        </p>
      </div>

      <div className="rounded-3xl border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead className="hidden sm:table-cell">Prenda</TableHead>
              <TableHead className="hidden text-center sm:table-cell">Talla</TableHead>
              {locations.map((l) => (
                <TableHead
                  key={l.id}
                  className={cn("text-center", l.id === myLocationId && "bg-primary/10 text-primary")}
                >
                  {l.id === myLocationId && <MapPin className="mr-1 inline size-3.5 align-[-2px]" aria-label="Tu ubicación" />}
                  {shortName(l.name)}
                </TableHead>
              ))}
              <TableHead className="text-center">En tránsito</TableHead>
              {showPending && (
                <TableHead className="text-center" title="Faltantes de traslados recibidos con diferencias que Belén aún no resuelve">
                  Por resolver
                </TableHead>
              )}
              <TableHead className="hidden text-center sm:table-cell">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5 + locations.length + (showPending ? 1 : 0)} className="py-10 text-center text-muted-foreground">
                  No hay prendas que coincidan con la búsqueda.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.variantId}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/stock/${r.variantId}/kardex`} className="text-brand-ink underline-offset-4 hover:underline" title="Ver kardex">
                    {r.sku}
                  </Link>
                  {r.total === 0 && (
                    <div className="mt-1">
                      <StatusBadge tone="danger" icon={PackageX} className="font-sans">
                        Sin stock
                      </StatusBadge>
                    </div>
                  )}
                  <div className="max-w-[8rem] whitespace-normal font-sans text-[11px] text-muted-foreground sm:hidden">
                    {r.productName} · {r.color} · talla {r.size} · total {r.total}
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="font-medium">{r.productName}</div>
                  <div className="text-xs text-muted-foreground">{r.color}</div>
                </TableCell>
                <TableCell className="hidden text-center sm:table-cell">{r.size}</TableCell>
                {locations.map((l) => (
                  <TableCell key={l.id} className={cn("text-center", l.id === myLocationId && "bg-primary/5")}>
                    <StockCellView cell={cellFor(r, l.id)} threshold={r.lowStockThreshold} />
                  </TableCell>
                ))}
                <TableCell className="text-center tabular-nums">
                  {r.inTransit > 0 ? <StatusBadge tone="info">{r.inTransit}</StatusBadge> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                {showPending && (
                  <TableCell className="text-center tabular-nums" data-testid="pending-resolution">
                    {r.pendingResolution > 0 ? (
                      <Link href="/traslados?tab=con-diferencias" className="inline-block rounded-full" title="Ver traslados con diferencias">
                        <StatusBadge tone="violet" className="hover:underline">
                          {r.pendingResolution}
                        </StatusBadge>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="hidden text-center font-bold tabular-nums sm:table-cell">{r.total}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 text-xs text-muted-foreground">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <li className="flex items-center gap-1.5">
            <StatusBadge tone="warn" className="px-1.5 py-0 text-[11px] leading-4">
              Bajo
            </StatusBadge>
            stock bajo
          </li>
          <li>
            <span className="font-semibold text-tone-violet">res.</span> reservado para pedidos online
          </li>
          <li className="flex items-center gap-1.5">
            <StatusBadge tone="info">3</StatusBadge>
            en tránsito
          </li>
          <li className="flex items-center gap-1.5">
            <StatusBadge tone="violet">1</StatusBadge>
            por resolver
          </li>
        </ul>
        <p>
          Total = físico en todas las ubicaciones + en tránsito + por resolver (faltantes de traslados que Belén aún no resuelve). Toca un SKU para ver su
          kardex.
        </p>
      </div>
    </div>
  );
}
