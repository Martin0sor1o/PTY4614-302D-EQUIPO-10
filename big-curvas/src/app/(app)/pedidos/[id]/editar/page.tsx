import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageAccess } from "@/modules/auth";
import { OrderForm } from "@/components/orders/order-form";
import { loadOrder } from "../../load-order";

export const dynamic = "force-dynamic";

export default async function EditOrderPage({ params }: PageProps<"/pedidos/[id]/editar">) {
  const user = await requirePageAccess(["ADMIN"]);
  const order = await loadOrder(params, user);
  if (order.status !== "PENDIENTE_PAGO") redirect(`/pedidos/${order.id}`);
  return (
    <div className="space-y-4">
      <div>
        <Link href={`/pedidos/${order.id}`} className="text-sm text-brand-ink underline-offset-4 hover:underline">
          ← {order.number}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Editar {order.number}</h1>
        <p className="text-sm text-muted-foreground">Mientras esté pendiente de pago se puede cambiar todo; no hay nada apartado.</p>
      </div>
      <OrderForm
        initial={{
          orderId: order.id,
          channel: order.channel === "WHATSAPP" ? "WHATSAPP" : "INSTAGRAM",
          customer: order.customer,
          lines: order.lines.map((l) => ({
            variantId: l.variantId,
            sku: l.sku,
            description: `${l.productName} · ${l.color} · T${l.size}`,
            unitPrice: l.unitPrice,
            qty: l.quantity,
            discountBps: l.discountBps,
            availability: l.availability,
          })),
          shippingCost: order.shippingCost,
          shippingAddress: order.shippingAddress ?? "",
          notes: order.notes ?? "",
        }}
      />
    </div>
  );
}
