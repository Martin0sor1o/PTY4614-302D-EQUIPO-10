import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { z } from "zod";
import { requirePageAccess } from "@/modules/auth";
import { getOrderBoard, type OrderBoardItem, type OrderStatus } from "@/modules/orders";
import { formatCLP } from "@/lib/money";
import { formatTimeWithSeconds } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "@/components/stock/auto-refresh";
import { ageDays, ageLabel, CHANNEL_LABEL, ORDER_STATUS_LABEL, OrderStatusBadge } from "@/components/orders/status-badge";
import { buttonVariants } from "@/components/ui/button";
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
        <div className={cn("mt-0.5 text-xs tabular-nums md:hidden", stale ? "font-medium text-red-700" : "text-muted-foreground")}>
          {o.units} {o.units === 1 ? "prenda" : "prendas"} · {formatCLP(o.total)} · {ageLabel(o.statusSince, now)}
        </div>
        <div className="mt-1 md:hidden">
          <OrderStatusBadge status={o.status} />
        </div>
      </TableCell>
      <TableCell className="hidden text-center tabular-nums md:table-cell">{o.units}</TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">{formatCLP(o.total)}</TableCell>
      <TableCell className="hidden md:table-cell">
        <OrderStatusBadge status={o.status} />
      </TableCell>
      <TableCell className={cn("hidden whitespace-nowrap text-sm tabular-nums md:table-cell", stale ? "font-medium text-red-700" : "text-muted-foreground")} data-stale={stale || undefined}>
        {ageLabel(o.statusSince, now)}
      </TableCell>
      <TableCell className="text-right">
        <Link href={next ? next.href(o.id) : `/pedidos/${o.id}`} className={buttonVariants({ variant: next ? "default" : "outline", size: "sm" })}>
          {next?.label ?? "Ver"}
        </Link>
      </TableCell>
    </TableRow>
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
          <h1 className="text-2xl font-semibold tracking-tight">Pedidos online</h1>
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
                "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-strong",
                active ? "border-brand-ink text-brand-ink" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label(t)}
              {n ? (
                <span className="rounded-full bg-brand-black px-1.5 py-0.5 text-[11px] leading-none text-brand-pink" data-testid={`count-${t}`}>
                  {n}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Clienta</TableHead>
              <TableHead className="hidden text-center md:table-cell">Unidades</TableHead>
              <TableHead className="hidden text-right md:table-cell">Total</TableHead>
              <TableHead className="hidden md:table-cell">Estado</TableHead>
              <TableHead className="hidden md:table-cell">En este estado</TableHead>
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
