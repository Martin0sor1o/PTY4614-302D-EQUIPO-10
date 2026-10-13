import type { z } from "zod";
import type { Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import type { IdempotentResult } from "@/lib/idempotency";
import { parseInput } from "@/lib/validation";
import { OrderStatus, PaymentMethod } from "@/generated/prisma/client";
import { createOnlineSale, priceOrder } from "@/modules/sales";
import { allocateLines } from "./allocate";
import { orderCommand, recordEvent, transition } from "./internal";
import { confirmPaymentSchema } from "./schemas";
import type { OrderDetail } from "./types";

export type ConfirmPaymentInput = { actor: Actor } & z.input<typeof confirmPaymentSchema>;

/**
 * CONFIRMAR PAGO (docs/03 §6.2 paso 2): UNA transacción.
 *   1. PENDIENTE_PAGO → PAGADO (cambio condicional: bloquea el pedido; PAGADO solo existe dentro de esta transacción).
 *   2. `reserve()` por cada línea: en BODEGA, o en la tienda que Belén eligió para una línea que la bodega no puede
 *      cubrir completa. Si alguna ya no tiene disponible → STOCK_INSUFICIENTE nombrando la prenda y se revierte todo
 *      (el pedido sigue pendiente de pago).
 *   3. `Sale` canal del pedido en BODEGA (correlativo BOD-…, líneas y pago), SIN movimientos de stock (RN-08, RN-13).
 *   4. Por las líneas apartadas en la tienda se crea un traslado tienda → bodega ligado al pedido → ESPERANDO_TRASPASO;
 *      si todo quedó en bodega → LISTO_PARA_PREPARAR.
 * Idempotente: repetir la clave devuelve el pedido sin volver a reservar ni crear otra venta.
 */
export async function confirmPayment(input: ConfirmPaymentInput): Promise<IdempotentResult<OrderDetail>> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  const data = parseInput(confirmPaymentSchema, input);
  return orderCommand({
    orderId: data.orderId,
    idempotencyKey: data.idempotencyKey,
    execute: (tx) => executeConfirm(tx, input.actor, data),
  });
}

async function executeConfirm(tx: Tx, actor: Actor, data: ReturnType<typeof confirmPaymentSchema.parse>): Promise<void> {
  const { orderId, payment, lineSources, idempotencyKey } = data;
  const order = await tx.onlineOrder.findUnique({
    where: { id: orderId },
    select: { id: true, number: true, channel: true, customerId: true, fulfillmentLocationId: true, shippingCost: true, subtotal: true, discountTotal: true, total: true },
  });
  if (!order) throw new AppError("NOT_FOUND", "El pedido no existe.", { orderId });
  assertAccess(actor, { roles: ["ADMIN"], locationId: order.fulfillmentLocationId });

  await transition(
    tx,
    orderId,
    OrderStatus.PENDIENTE_PAGO,
    OrderStatus.PAGADO,
    { paymentMethod: PaymentMethod[payment.method], paymentReference: payment.reference ?? null, paidAt: new Date() },
    "confirmar el pago",
  );

  const lines = await tx.onlineOrderLine.findMany({
    where: { orderId },
    select: { id: true, variantId: true, quantity: true, unitPrice: true, discountBps: true, sourceLocationId: true },
    orderBy: { variantId: "asc" },
  });
  if (lines.length === 0) throw new AppError("VALIDATION", "El pedido no tiene prendas.");

  // Los totales guardados al registrar deben coincidir con lo que calcula sales/pricing (precio congelado).
  const priced = priceOrder(lines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity, discountBps: l.discountBps })), order.shippingCost);
  if (priced.total !== order.total || priced.subtotal !== order.subtotal || priced.discountTotal !== order.discountTotal) {
    throw new AppError("CONFLICT", `Los totales del pedido ${order.number} no cuadran con sus líneas. Edítalo antes de confirmar el pago.`);
  }

  // Se aparta recién ahora (RN-07). Orden de bloqueo: pedido (arriba) → traslados → reservas → stock.
  const { transfers } = await allocateLines(tx, {
    actor,
    order: { id: order.id, number: order.number, fulfillmentLocationId: order.fulfillmentLocationId },
    items: lines.map((l) => ({ lineId: l.id, variantId: l.variantId, qty: l.quantity })),
    storeSources: new Map(lineSources.map((s) => [s.lineId, s.locationId])),
    keyBase: idempotencyKey,
    setLineSource: true,
  });

  const sale = await createOnlineSale(tx, {
    actor,
    locationId: order.fulfillmentLocationId,
    channel: order.channel === "WHATSAPP" ? "WHATSAPP" : "INSTAGRAM",
    onlineOrderId: orderId,
    customerId: order.customerId,
    lines: lines.map((l) => ({ variantId: l.variantId, qty: l.quantity, unitPrice: l.unitPrice, discountBps: l.discountBps })),
    shippingCost: order.shippingCost,
    payment: { method: payment.method, reference: payment.reference },
    idempotencyKey: `${idempotencyKey}:sale`,
  });

  const next = transfers.length > 0 ? OrderStatus.ESPERANDO_TRASPASO : OrderStatus.LISTO_PARA_PREPARAR;
  await transition(tx, orderId, OrderStatus.PAGADO, next, {}, "confirmar el pago");
  await recordEvent(tx, {
    orderId,
    status: next,
    userId: actor.id,
    note:
      `Pago confirmado (${payment.method}${payment.reference ? ` ${payment.reference}` : ""}) · venta ${sale.number}` +
      (transfers.length > 0 ? ` · traslado ${transfers.map((t) => t.number).join(", ")} desde la tienda` : ""),
    idempotencyKey,
  });
}
