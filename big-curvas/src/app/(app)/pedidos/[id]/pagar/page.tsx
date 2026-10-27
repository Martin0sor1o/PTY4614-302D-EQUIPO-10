import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { requirePageAccess } from "@/modules/auth";
import { formatCLP } from "@/lib/money";
import { PayForm } from "@/components/orders/pay-form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { loadOrder } from "../../load-order";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Confirmar pago" };

export default async function PayOrderPage({ params }: PageProps<"/pedidos/[id]/pagar">) {
  const user = await requirePageAccess(["ADMIN"]);
  const o = await loadOrder(params, user);
  if (o.status !== "PENDIENTE_PAGO") redirect(`/pedidos/${o.id}`);

  // Disponible HOY en bodega por línea (la validación real ocurre al confirmar, en una sola transacción).
  const short = o.lines.filter((l) => (l.availability.find((a) => a.locationId === o.fulfillmentLocation.id)?.available ?? 0) < l.quantity);

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/pedidos/${o.id}`} className="text-sm text-brand-ink underline-offset-4 hover:underline">
          ← {o.number}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Confirmar pago de {o.number}</h1>
        <p className="text-sm text-muted-foreground">
          {o.customer.name} · {formatCLP(o.total)}. Al confirmar se aparta el stock en <strong>{o.fulfillmentLocation.name}</strong> y se registra la venta.
        </p>
      </div>

      {short.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-tone-danger/30 bg-tone-danger-soft p-3 text-sm text-tone-danger" data-testid="short-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {short.length === 1 ? "Una prenda no alcanza" : `${short.length} prendas no alcanzan`} hoy en {o.fulfillmentLocation.name}:{" "}
            {short.map((l) => l.sku).join(", ")}. Puedes apartarlas en la tienda si tiene disponible (se trae a bodega con un traslado). Si no hay stock al
            confirmar, el pago no se registra y se indica la prenda.
          </span>
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prenda</TableHead>
              <TableHead className="text-center">Cantidad</TableHead>
              <TableHead>Disponible hoy</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {o.lines.map((l) => {
              const bodega = l.availability.find((a) => a.locationId === o.fulfillmentLocation.id)?.available ?? 0;
              const isShort = bodega < l.quantity;
              return (
                <TableRow key={l.id} data-testid="pay-line" data-short={isShort || undefined}>
                  <TableCell>
                    <div className="font-mono text-xs">{l.sku}</div>
                    <div className="text-sm">
                      {l.productName} · {l.color} · T{l.size}
                    </div>
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{l.quantity}</TableCell>
                  <TableCell className="text-xs">
                    {l.availability.map((a) => (
                      <div key={a.locationId} className={cn(a.locationId === o.fulfillmentLocation.id && isShort && "font-semibold text-tone-danger")}>
                        {a.name}: <span className="tabular-nums">{a.available}</span>
                      </div>
                    ))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCLP(l.lineTotal)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <PayForm
        orderId={o.id}
        number={o.number}
        total={o.total}
        fulfillmentLocationId={o.fulfillmentLocation.id}
        lines={o.lines.map((l) => ({
          lineId: l.id,
          sku: l.sku,
          description: `${l.productName} · ${l.color} · T${l.size}`,
          qty: l.quantity,
          availability: l.availability,
        }))}
      />
    </div>
  );
}
