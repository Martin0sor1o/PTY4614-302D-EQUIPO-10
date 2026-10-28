import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageAccess } from "@/modules/auth";
import { getCouriers } from "@/modules/orders";
import { DispatchForm } from "@/components/orders/dispatch-form";
import { Notice } from "@/components/ui/notice";
import { loadOrder } from "../../load-order";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Despachar pedido" };

export default async function DispatchOrderPage({ params }: PageProps<"/pedidos/[id]/despachar">) {
  const user = await requirePageAccess(["ADMIN", "BODEGA"]);
  const o = await loadOrder(params, user, true);
  if (o.status !== "PREPARADO") redirect(`/pedidos/${o.id}`);
  const couriers = await getCouriers();
  const inBodega = user.role !== "ADMIN" || user.activeLocation?.id === o.fulfillmentLocation.id;

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/pedidos/${o.id}`} className="inline-flex items-center rounded-md text-sm font-semibold text-brand-ink underline-offset-4 hover:underline max-md:min-h-11">
          ← {o.number}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Despachar {o.number}</h1>
        <p className="text-sm text-muted-foreground">
          {o.customer.name} · {o.shippingAddress}. El despacho es solo por courier.
        </p>
      </div>
      {!inBodega ? (
        <Notice tone="warn" role="alert" data-testid="needs-bodega">
          Para despachar elige <strong>“Operando en: {o.fulfillmentLocation.name}”</strong> en el menú superior.
        </Notice>
      ) : couriers.length === 0 ? (
        <Notice tone="danger" role="alert">
          No hay couriers configurados (settings.couriers).
        </Notice>
      ) : (
        <DispatchForm orderId={o.id} couriers={couriers} />
      )}
    </div>
  );
}
