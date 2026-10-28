import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Plus } from "lucide-react";
import { z } from "zod";
import { requirePageAccess } from "@/modules/auth";
import { getOrderBoard, type OrderBoardItem, type OrderStatus } from "@/modules/orders";
import { formatCLP } from "@/lib/money";
import { formatTimeWithSeconds } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "@/components/stock/auto-refresh";
import { ageDays, ageLabel, CHANNEL_LABEL, ORDER_STATUS_LABEL, OrderStatusBadge } from "@/components/orders/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

// Tablero de pedidos (RF-PED-10). "Activos" = todo lo que todavía requiere una acción de Belén.
const TABS = ["activos", "PENDIENTE_PAGO", "ESPERANDO_TRASPASO", "LISTO_PARA_PREPARAR", "PREPARADO", "DESPACHADO", "ENTREGADO", "CANCELADO"] as const;
type Tab = (typeof TABS)[number];
const ACTIVE: OrderStatus[] = ["PENDIENTE_PAGO", "ESPERANDO_TRASPASO", "LISTO_PARA_PREPARAR", "PREPARADO", "DESPACHADO"];
const searchSchema = z.object({ tab: z.enum(TABS).optional().catch(undefined) });

// Un pedido que lleva ≥ 2 días esperando en estos estados se marca (informativo, calculado al mostrar).
const STALE_DAYS = 2;
const STALE_STATES: OrderStatus[] = ["PENDIENTE_PAGO", "ESPERANDO_TRASPASO", "LISTO_PARA_PREPARAR", "PREPARADO"];

const NEXT_STEP: Partial<Record<OrderStatus, { href: (id: string) => string; label: string }>> = {
  PENDIENTE_PAGO: { href: (id) => `/pedidos/${id}/pagar`, label: "Confirmar pago" },
  LISTO_PARA_PREPARAR: { href: (id) => `/pedidos/${id}/preparar`, label: "Preparar" },
  PREPARADO: { href: (id) => `/pedidos/${id}/despachar`, label: "Despachar" },
};

function Row({ o, now }: { o: OrderBoardItem; now: Date }) {
  const next = NEXT_STEP[o.status];
  const stale = STALE_STATES.includes(o.status) && ageDays(o.statusSince, now) >= STALE_DAYS;
  return (
    <TableRow data-testid="order-row" data-status={o.status}>
      <TableCell className="font-mono text-xs">
        <Link href={`/pedidos/${o.id}`} className="text-brand-ink underline-offset-4 hover:underline">
          {o.number}
        </Link>
      </TableCell>
      <TableCell>
        <div className="font-medium">{o.customerName}</div>
        <div className="text-xs text-muted-foreground">
          {CHANNEL_LABEL[o.channel]}
          {o.instagramHandle ? ` · @${o.instagramHandle}` : ""}
        </div>
      </TableCell>
      <TableCell className="text-center tabular-nums">{o.units}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCLP(o.total)}</TableCell>
      <TableCell>
        <OrderStatusBadge status={o.status} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums" data-stale={stale || undefined}>
        {stale ? (
          <StatusBadge tone="danger" icon={Clock}>
            {ageLabel(o.statusSince, now)}
          </StatusBadge>
        ) : (
          ageLabel(o.statusSince, now)
        )}
      </TableCell>
      <TableCell className="text-right">
        <Link href={next ? next.href(o.id) : `/pedidos/${o.id}`} className={buttonVariants({ variant: next ? "default" : "outline", size: "sm" })}>
          {next?.label ?? "Ver"}
        </Link>
      </TableCell>
    </TableRow>
  );
}

/** Celular (bajo md): una tarjeta por pedido, con el estado y la acción siguiente a la vista (sin scroll horizontal). */
function OrderCard({ o, now }: { o: OrderBoardItem; now: Date }) {
  const next = NEXT_STEP[o.status];
  const stale = STALE_STATES.includes(o.status) && ageDays(o.statusSince, now) >= STALE_DAYS;
  return (
    <li className="space-y-2 rounded-2xl border bg-card p-3 shadow-soft" data-status={o.status}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/pedidos/${o.id}`} className="inline-flex min-h-11 items-center font-mono text-sm font-semibold whitespace-nowrap text-brand-ink underline-offset-4 hover:underline">
          {o.number}
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2">
          <OrderStatusBadge status={o.status} />
          {stale && (
            <StatusBadge tone="danger" icon={Clock}>
              {ageLabel(o.statusSince, now)}
            </StatusBadge>
          )}
        </div>
      </div>
      <div>
        <div className="font-semibold">{o.customerName}</div>
        <div className="text-sm text-muted-foreground">
          {CHANNEL_LABEL[o.channel]}
          {o.instagramHandle ? ` · @${o.instagramHandle}` : ""}
        </div>
        <div className="text-sm text-muted-foreground tabular-nums">
          {o.units} {o.units === 1 ? "prenda" : "prendas"} · {formatCLP(o.total)}
          {!stale && ` · ${ageLabel(o.statusSince, now)}`}
        </div>
      </div>
      <Link href={next ? next.href(o.id) : `/pedidos/${o.id}`} className={buttonVariants({ variant: next ? "default" : "outline", size: "default", className: "w-full" })}>
        {next?.label ?? "Ver"}
      </Link>
    </li>
  );
}

export const metadata: Metadata = { title: "Pedidos" };

export default async function OrdersPage({ searchParams }: PageProps<"/pedidos">) {
  const user = await requirePageAccess(["ADMIN"]);
  const { tab: tabParam } = searchSchema.parse(await searchParams);
  const tab: Tab = tabParam ?? "activos";
  const statuses = tab === "activos" ? ACTIVE : [tab as OrderStatus];
  const { counts, orders } = await getOrderBoard({ actor: user, statuses });
  const now = new Date();
  const activeCount = ACTIVE.reduce((a, s) => a + counts[s], 0);
  const countOf = (t: Tab) => (t === "activos" ? activeCount : counts[t as OrderStatus]);
  const label = (t: Tab) => (t === "activos" ? "Activos" : ORDER_STATUS_LABEL[t as OrderStatus]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pedidos online</h1>
          <p className="text-sm text-muted-foreground">Pedidos de Instagram y WhatsApp. Se apartan al confirmar el pago y salen siempre de la bodega.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AutoRefresh renderedAt={formatTimeWithSeconds(now)} />
          <Link href="/pedidos/nuevo" className={buttonVariants({ size: "lg", className: "h-11 px-4" })}>
            <Plus /> Nuevo pedido
          </Link>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b" aria-label="Estados de los pedidos">
        {TABS.map((t) => {
          const active = t === tab;
          const n = countOf(t);
          return (
            <Link
              key={t}
              href={t === "activos" ? "/pedidos" : `/pedidos?tab=${t}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold max-md:min-h-11",
                active ? "border-brand-ink text-brand-ink" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label(t)}
              {n ? (
                <span className="rounded-full bg-brand-black px-1.5 py-0.5 text-xs leading-none text-brand-pink" data-testid={`count-${t}`}>
                  {n}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <ul className="space-y-3 md:hidden" aria-label="Pedidos">
        {orders.length === 0 && <li className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">No hay pedidos en esta bandeja.</li>}
        {orders.map((o) => (
          <OrderCard key={o.id} o={o} now={now} />
        ))}
      </ul>

      <div className="hidden rounded-3xl border bg-card shadow-soft md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Clienta</TableHead>
              <TableHead className="text-center">Unidades</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>En este estado</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No hay pedidos en esta bandeja.
                </TableCell>
              </TableRow>
            )}
            {orders.map((o) => (
              <Row key={o.id} o={o} now={now} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
