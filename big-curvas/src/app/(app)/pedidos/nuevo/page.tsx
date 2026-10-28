import type { Metadata } from "next";
import Link from "next/link";
import { requirePageAccess } from "@/modules/auth";
import { OrderForm } from "@/components/orders/order-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Nuevo pedido" };

export default async function NewOrderPage() {
  await requirePageAccess(["ADMIN"]);
  return (
    <div className="space-y-4">
      <div>
        <Link href="/pedidos" className="inline-flex items-center rounded-md text-sm font-semibold text-brand-ink underline-offset-4 hover:underline max-md:min-h-11">
          ← Pedidos
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Nuevo pedido</h1>
        <p className="text-sm text-muted-foreground">
          Queda pendiente de pago. Aquí solo se ve el disponible: <strong>no se aparta nada hasta confirmar el pago</strong>.
        </p>
      </div>
      <OrderForm initial={{ channel: "INSTAGRAM", customer: null, lines: [], shippingCost: 0, shippingAddress: "", notes: "" }} />
    </div>
  );
}
