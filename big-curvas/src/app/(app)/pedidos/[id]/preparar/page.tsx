import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageAccess } from "@/modules/auth";
import { PickForm } from "@/components/orders/pick-form";
import { loadOrder } from "../../load-order";

export const dynamic = "force-dynamic";

export default async function PrepareOrderPage({ params }: PageProps<"/pedidos/[id]/preparar">) {
  const user = await requirePageAccess(["ADMIN", "BODEGA"]);
  const o = await loadOrder(params, user, true);
  if (o.status !== "LISTO_PARA_PREPARAR") redirect(`/pedidos/${o.id}`);
  const inBodega = user.role !== "ADMIN" || user.activeLocation?.id === o.fulfillmentLocation.id;

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/pedidos/${o.id}`} className="text-sm text-brand-ink underline-offset-4 hover:underline">
          ← {o.number}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Preparar {o.number}</h1>
        <p className="text-sm text-muted-foreground">
          {o.customer.name}. Escanea cada prenda del pedido; al confirmar, el stock de {o.fulfillmentLocation.name} baja. Una prenda que no es del pedido se rechaza.
        </p>
      </div>
      {inBodega ? (
        <PickForm
          orderId={o.id}
          number={o.number}
          lines={o.lines.map((l) => ({
            variantId: l.variantId,
            sku: l.sku,
            barcode: l.barcode,
            description: `${l.productName} · ${l.color} · T${l.size}`,
            quantity: l.quantity,
          }))}
        />
      ) : (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="needs-bodega">
          Para preparar el pedido elige <strong>“Operando en: {o.fulfillmentLocation.name}”</strong> en el menú superior.
        </p>
      )}
    </div>
  );
}
