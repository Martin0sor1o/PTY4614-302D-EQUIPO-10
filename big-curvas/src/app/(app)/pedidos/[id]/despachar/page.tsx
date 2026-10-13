import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageAccess } from "@/modules/auth";
import { getCouriers } from "@/modules/orders";
import { DispatchForm } from "@/components/orders/dispatch-form";
import { loadOrder } from "../../load-order";

export const dynamic = "force-dynamic";

export default async function DispatchOrderPage({ params }: PageProps<"/pedidos/[id]/despachar">) {
  const user = await requirePageAccess(["ADMIN", "BODEGA"]);
  const o = await loadOrder(params, user, true);
  if (o.status !== "PREPARADO") redirect(`/pedidos/${o.id}`);
  const couriers = await getCouriers();
  const inBodega = user.role !== "ADMIN" || user.activeLocation?.id === o.fulfillmentLocation.id;

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/pedidos/${o.id}`} className="text-sm text-brand-ink underline-offset-4 hover:underline">
          ← {o.number}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Despachar {o.number}</h1>
        <p className="text-sm text-muted-foreground">
          {o.customer.name} · {o.shippingAddress}. El despacho es solo por courier.
        </p>
      </div>
      {!inBodega ? (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="needs-bodega">
          Para despachar elige <strong>“Operando en: {o.fulfillmentLocation.name}”</strong> en el menú superior.
        </p>
      ) : couriers.length === 0 ? (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          No hay couriers configurados (settings.couriers).
        </p>
      ) : (
        <DispatchForm orderId={o.id} couriers={couriers} />
      )}
    </div>
  );
}
