import type { Metadata } from "next";
import Link from "next/link";
import { Lock, MapPin, PackageX } from "lucide-react";
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

/** «Reservado» no es un estado de alerta: va en texto neutro con candado, sin badge ni color propio (el violeta es solo «por resolver»). */
function Reserved({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 font-semibold text-foreground">
      <Lock className="size-3" aria-hidden />
      {n} res.
    </span>
  );
}

function StockCellView({ cell, threshold, align = "center" }: { cell: StockCell; threshold: number | null; align?: "center" | "start" }) {
  const low = cell.available > 0 && threshold !== null && cell.available <= threshold;
  return (
    <div title={`Físico ${cell.onHand} · Reservado ${cell.reserved} · Disponible ${cell.available}`} className="leading-tight">
      <div className={cn("flex items-center gap-1.5", align === "center" ? "justify-center" : "justify-start")}>
        <span className={cn("text-base font-bold tabular-nums", cell.available === 0 && "font-normal text-muted-foreground")}>
          {cell.available}
        </span>
        {low && (
          <StatusBadge tone="warn" className="px-1.5 py-0 leading-4">
            Bajo
          </StatusBadge>
        )}
      </div>
      {cell.reserved > 0 && (
        <div className="text-xs text-muted-foreground">
          de {cell.onHand} · <Reserved n={cell.reserved} />
        </div>
      )}
    </div>
  );
}

function PendingBadge({ n }: { n: number }) {
  return (
    <Link href="/traslados?tab=con-diferencias" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full sm:min-h-0 sm:min-w-0" title="Ver traslados con diferencias">
      <StatusBadge tone="violet" className="hover:underline">
        {n}
      </StatusBadge>
    </Link>
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

      {/* Celular (bajo sm): una tarjeta por variante, sin scroll horizontal. */}
      <ul className="space-y-3 sm:hidden" aria-label="Variantes">
        {rows.length === 0 && (
          <li className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">No hay prendas que coincidan con la búsqueda.</li>
        )}
        {rows.map((r) => (
          <li key={r.variantId} className="rounded-2xl border bg-card p-3 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/stock/${r.variantId}/kardex`}
                  className="inline-flex min-h-11 items-center rounded-lg font-mono text-sm font-semibold text-brand-ink underline-offset-4 hover:underline"
                  title="Ver kardex"
                >
                  {r.sku}
                </Link>
                <div className="text-sm">
                  {r.productName} · {r.color} · talla {r.size}
                </div>
                {r.total === 0 && (
                  <StatusBadge tone="danger" icon={PackageX} className="mt-1">
                    Sin stock
                  </StatusBadge>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Total</div>
                <div className="text-2xl leading-none font-bold tabular-nums">{r.total}</div>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              {locations.map((l) => (
                <div key={l.id} className={cn("rounded-xl bg-background p-2", l.id === myLocationId && "bg-primary/10 ring-1 ring-primary/30")}>
                  <dt className={cn("text-xs font-bold tracking-wider uppercase", l.id === myLocationId ? "text-primary" : "text-muted-foreground")}>
                    {l.id === myLocationId && <MapPin className="mr-1 inline size-3.5 align-[-2px]" aria-label="Tu ubicación" />}
                    {shortName(l.name)}
                  </dt>
                  <dd>
                    <StockCellView cell={cellFor(r, l.id)} threshold={r.lowStockThreshold} align="start" />
                  </dd>
                </div>
              ))}
              <div className="rounded-xl bg-background p-2">
                <dt className="text-xs font-bold tracking-wider text-muted-foreground uppercase">En tránsito</dt>
                <dd className="mt-0.5 tabular-nums">
                  {r.inTransit > 0 ? <StatusBadge tone="info">{r.inTransit}</StatusBadge> : <span className="text-muted-foreground">—</span>}
                </dd>
              </div>
              <div className="rounded-xl bg-background p-2">
                <dt className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Por resolver</dt>
                <dd className="mt-0.5 tabular-nums">
                  {r.pendingResolution > 0 ? <PendingBadge n={r.pendingResolution} /> : <span className="text-muted-foreground">—</span>}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden rounded-3xl border bg-card shadow-soft sm:block">
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
                      <PendingBadge n={r.pendingResolution} />
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
            <StatusBadge tone="warn" className="px-1.5 py-0 leading-4">
              Bajo
            </StatusBadge>
            stock bajo
          </li>
          <li>
            <Reserved n={2} /> reservado para pedidos online
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
