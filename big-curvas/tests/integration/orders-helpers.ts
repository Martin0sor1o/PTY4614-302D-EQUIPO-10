import { db } from "@/lib/db";
import { confirmPayment, prepareOrder, registerOrder, type OrderDetail } from "@/modules/orders";
import { newKey, type Fixtures } from "./helpers";

// Utilidades de los tests de pedidos online (solo usan la API pública de los módulos).

export type OrderLineSpec = { sku: string; qty?: number; discountBps?: number };

export async function registerTestOrder(
  f: Fixtures,
  lines: OrderLineSpec[],
  opts: { shippingCost?: number; key?: string; channel?: "INSTAGRAM" | "WHATSAPP" } = {},
): Promise<OrderDetail> {
  const { result } = await registerOrder({
    actor: f.actors.belen,
    channel: opts.channel ?? "INSTAGRAM",
    newCustomer: { name: "Clienta de prueba", instagramHandle: "@clienta.prueba", phone: "+56911112222", address: "Av. Libertador 123", commune: "Rancagua" },
    lines: await Promise.all(lines.map(async (l) => ({ variantId: await f.variant(l.sku), qty: l.qty ?? 1, discountBps: l.discountBps ?? 0 }))),
    shippingCost: opts.shippingCost ?? 0,
    shippingAddress: "Av. Libertador 123, Rancagua",
    idempotencyKey: opts.key ?? newKey("pedido"),
  });
  return result;
}

export async function confirmTestPayment(
  f: Fixtures,
  orderId: string,
  payment: { method: "TRANSFERENCIA" | "DEBITO" | "CREDITO" | "EFECTIVO"; reference?: string } = { method: "TRANSFERENCIA", reference: "TRF-1001" },
  key = newKey("pago"),
) {
  return confirmPayment({ actor: f.actors.belen, orderId, payment, idempotencyKey: key });
}

/** Escanea exactamente lo que pide el pedido. */
export async function prepareTestOrder(f: Fixtures, order: OrderDetail, key = newKey("picking"), actor = f.actors.belen) {
  return prepareOrder({
    actor,
    orderId: order.id,
    scanned: order.lines.map((l) => ({ variantId: l.variantId, qty: l.quantity })),
    idempotencyKey: key,
  });
}

/** Cuenta de movimientos del ledger ligados a un pedido (VENTA_ONLINE / REINGRESO_PEDIDO_CANCELADO). */
export function orderMovements(orderId: string) {
  return db.inventoryMovement.findMany({ where: { refType: "ONLINE_ORDER", refId: orderId }, orderBy: { createdAt: "asc" } });
}
