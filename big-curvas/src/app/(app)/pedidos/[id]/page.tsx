import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requirePageAccess } from "@/modules/auth";
import { formatCLP } from "@/lib/money";
import { formatDateTime, formatTimeWithSeconds } from "@/lib/dates";
import { AutoRefresh } from "@/components/stock/auto-refresh";
import { FillShortage } from "@/components/orders/fill-shortage";
import { RefundOrder } from "@/components/orders/refund-order";
import { CancelOrder, DeliverOrder } from "@/components/orders/order-actions";
import { ageLabel, CHANNEL_LABEL, ORDER_STATUS_LABEL, OrderStatusBadge, PAYMENT_LABEL } from "@/components/orders/status-badge";
import { TransferStatusBadge } from "@/components/transfers/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OrderDetail } from "@/modules/orders";
import { loadOrder } from "../load-order";

export const dynamic = "force-dynamic";

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

/** Qué pasa al cancelar según el estado (se muestra antes de confirmar). */
function cancelConsequence(o: OrderDetail): string {
  const sale = o.sale ? ` La venta ${o.sale.number} queda registrada con aviso de reembolso pendiente: después registras el reembolso en el pedido.` : "";
  switch (o.status) {
    case "PENDIENTE_PAGO":
      return "No hay nada apartado: no se mueve stock.";
    case "ESPERANDO_TRASPASO":
      return `Se liberan las reservas (tienda y bodega). El traslado en borrador se anula; si ya viaja, al llegar a bodega la prenda queda como stock libre.${sale}`;
    case "LISTO_PARA_PREPARAR":
      return `Se liberan las reservas en la bodega.${sale}`;
    case "PREPARADO":
      return `Las prendas ya salieron del stock: vuelven a la bodega (reingreso).${sale}`;
    default:
      return sale;
  }
}

export const metadata: Metadata = { title: "Pedido" };

export default async function OrderDetailPage({ params }: PageProps<"/pedidos/[id]">) {
  const user = await requirePageAccess(["ADMIN"]);
  const o = await loadOrder(params, user);
  const now = new Date();
  const cancellable = ["PENDIENTE_PAGO", "ESPERANDO_TRASPASO", "LISTO_PARA_PREPARAR", "PREPARADO"].includes(o.status);
  const shortLines = o.lines.filter((l) => l.shortage > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href="/pedidos" className="text-sm text-brand-ink underline-offset-4 hover:underline">
            ← Pedidos
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            <span className="font-mono" data-testid="order-number">
              {o.number}
            </span>
            <OrderStatusBadge status={o.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {CHANNEL_LABEL[o.channel]} · {ORDER_STATUS_LABEL[o.status].toLowerCase()} {ageLabel(o.statusSince, now)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutoRefresh renderedAt={formatTimeWithSeconds(now)} />
          {o.status === "PENDIENTE_PAGO" && (
            <>
              <Link href={`/pedidos/${o.id}/editar`} className={buttonVariants({ variant: "outline", size: "lg", className: "h-11 px-4" })}>
                Editar
              </Link>
              <Link href={`/pedidos/${o.id}/pagar`} className={buttonVariants({ size: "lg", className: "h-11 px-4" })}>
                Confirmar pago
              </Link>
            </>
          )}
          {o.status === "LISTO_PARA_PREPARAR" && (
            <Link href={`/pedidos/${o.id}/preparar`} className={buttonVariants({ size: "lg", className: "h-11 px-4" })}>
              Preparar
            </Link>
          )}
          {o.status === "PREPARADO" && (
            <Link href={`/pedidos/${o.id}/despachar`} className={buttonVariants({ size: "lg", className: "h-11 px-4" })}>
              Despachar
            </Link>
          )}
          {o.status === "DESPACHADO" && <DeliverOrder orderId={o.id} number={o.number} />}
        </div>
      </div>

      {o.refundPending && o.sale && <RefundOrder orderId={o.id} number={o.number} saleNumber={o.sale.number} amount={o.sale.total} />}
      {o.refund && (
        <p className="rounded-lg border border-tone-ok/30 bg-tone-ok-soft p-3 text-sm text-tone-ok" data-testid="refund-done">
          <strong>Reembolsado</strong> el {formatDateTime(o.refund.at)}
          {o.refund.byName ? ` por ${o.refund.byName}` : ""}: {o.refund.method}
          {o.refund.reference ? ` (${o.refund.reference})` : ""}. La venta {o.sale?.number} quedó anulada.
        </p>
      )}
      {o.cancellation && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm" data-testid="cancellation">
          Cancelado el {formatDateTime(o.cancellation.at)}
          {o.cancellation.byName ? ` por ${o.cancellation.byName}` : ""}. Motivo: {o.cancellation.reason}
        </p>
      )}
      {o.blockedByTransferDifference && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-tone-warn/30 bg-tone-warn-soft p-3 text-sm text-tone-warn" data-testid="order-blocked">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong>Pedido bloqueado.</strong> El traslado de este pedido llegó con diferencias. Se desbloquea cuando Belén las resuelve en Traslados → Con diferencias.
          </span>
        </div>
      )}

      {o.canFillShortage && (
        <FillShortage
          orderId={o.id}
          number={o.number}
          fulfillmentLocationId={o.fulfillmentLocation.id}
          lines={shortLines.map((l) => ({
            lineId: l.id,
            sku: l.sku,
            description: `${l.productName} · ${l.color} · T${l.size}`,
            qty: l.shortage,
            availability: l.availability,
          }))}
        />
      )}

      <dl className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="Clienta">
          {o.customer.name}
          <div className="text-xs font-normal text-muted-foreground">
            {[o.customer.instagramHandle && `@${o.customer.instagramHandle}`, o.customer.phone].filter(Boolean).join(" · ")}
          </div>
        </Meta>
        <Meta label="Despacho a">{o.shippingAddress ?? "—"}</Meta>
        <Meta label="Pago">
          {o.payment ? (
            <>
              {PAYMENT_LABEL[o.payment.method]}
              <div className="text-xs font-normal text-muted-foreground">
                {o.payment.reference ? `Ref. ${o.payment.reference} · ` : ""}
                {o.payment.paidAt ? formatDateTime(o.payment.paidAt) : ""}
              </div>
            </>
          ) : (
            "Pendiente"
          )}
        </Meta>
        <Meta label="Venta">{o.sale ? `${o.sale.number} (${o.sale.status === "COMPLETADA" ? "completada" : "anulada"})` : "—"}</Meta>
        {o.courier && (
          <Meta label="Courier">
            {o.courier}
            <div className="text-xs font-normal text-muted-foreground">Seguimiento {o.trackingNumber}</div>
          </Meta>
        )}
        <Meta label="Registrado por">
          {o.createdByName}
          <div className="text-xs font-normal text-muted-foreground">{formatDateTime(o.createdAt)}</div>
        </Meta>
        {o.notes && <Meta label="Notas">{o.notes}</Meta>}
      </dl>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prenda</TableHead>
              <TableHead className="text-center">Cant.</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-center">Dcto.</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Apartado</TableHead>
              <TableHead>Disponible hoy</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {o.lines.map((l) => (
              <TableRow key={l.id} data-testid="order-line">
                <TableCell>
                  <div className="font-mono text-xs">{l.sku}</div>
                  <div className="text-sm">
                    {l.productName} · {l.color} · T{l.size}
                  </div>
                </TableCell>
                <TableCell className="text-center tabular-nums">{l.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCLP(l.unitPrice)}</TableCell>
                <TableCell className="text-center tabular-nums">{l.discountBps ? `${l.discountBps / 100} %` : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCLP(l.lineTotal)}</TableCell>
                <TableCell className="text-xs" data-testid="line-reserved">
                  {l.reserved.length === 0 ? (
                    <span className="text-muted-foreground">{o.status === "PENDIENTE_PAGO" ? "Nada (se aparta al pagar)" : "—"}</span>
                  ) : (
                    l.reserved.map((r) => (
                      <div key={r.locationId}>
                        {r.name}: <span className="tabular-nums">{r.qty}</span>
                      </div>
                    ))
                  )}
                  {l.inTransit > 0 && <div className="text-tone-info">En camino a bodega: {l.inTransit}</div>}
                  {l.shortage > 0 && o.status === "ESPERANDO_TRASPASO" && <div className="font-medium text-tone-warn">Faltan {l.shortage}</div>}
                  {l.pickedQty > 0 && <div className="text-tone-ok">Preparadas: {l.pickedQty}</div>}
                </TableCell>
                <TableCell className="text-xs">
                  {l.availability.map((a) => (
                    <div key={a.locationId}>
                      {a.name}: <span className="tabular-nums">{a.available}</span>
                    </div>
                  ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-4">
          {o.transfers.length > 0 && (
            <section aria-labelledby="sec-traslados">
              <h2 id="sec-traslados" className="mb-1 font-medium">
                Traslados del pedido
              </h2>
              <ul className="space-y-1 text-sm">
                {o.transfers.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <Link href={`/traslados/${t.id}`} className="font-mono text-brand-ink underline-offset-4 hover:underline">
                      {t.number}
                    </Link>
                    <span>
                      {t.fromLocationName} → {t.toLocationName}
                    </span>
                    <TransferStatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {cancellable && <CancelOrder orderId={o.id} number={o.number} consequence={cancelConsequence(o)} />}
        </div>

        <dl className="w-full max-w-xs space-y-1 text-sm" data-testid="order-totals">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatCLP(o.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Descuentos</dt>
            <dd className="tabular-nums">-{formatCLP(o.discountTotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Envío</dt>
            <dd className="tabular-nums">{formatCLP(o.shippingCost)}</dd>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums" data-testid="order-total">
              {formatCLP(o.total)}
            </dd>
          </div>
        </dl>
      </div>

      <section aria-labelledby="sec-historial" className="space-y-2">
        <h2 id="sec-historial" className="font-medium">
          Historial
        </h2>
        <ol className="divide-y rounded-xl border bg-card" data-testid="order-history">
          {o.events.map((e, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="w-36 shrink-0 tabular-nums text-muted-foreground">{formatDateTime(e.at)}</span>
              <OrderStatusBadge status={e.status} />
              <span className="text-muted-foreground">{e.userName}</span>
              {e.note && <span>· {e.note}</span>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
