import type { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { runIdempotent, type IdempotentResult } from "@/lib/idempotency";
import { parseInput } from "@/lib/validation";
import { OrderStatus } from "@/generated/prisma/client";
import { createCustomer, getCustomer } from "@/modules/customers";
import { nextDocumentNumber } from "@/modules/numbering";
import { effectivePrice, getDiscountLimitBps, isDiscountOverLimit, priceOrder } from "@/modules/sales";
import { getFulfillmentLocation, recordEvent, TX_OPTIONS, transition } from "./internal";
import { loadOrderDetail } from "./queries";
import { registerOrderSchema, updateOrderSchema } from "./schemas";
import type { OrderDetail } from "./types";

// Registro y edición de pedidos online (solo ADMIN, RN-27). Registrar NO reserva ni mueve stock (RN-07):
// el disponible solo se muestra. Todos los montos los calcula el servidor con sales/pricing.

type RegisterData = ReturnType<typeof registerOrderSchema.parse>;
type OrderBody = Omit<RegisterData, "idempotencyKey">;

export type RegisterOrderInput = { actor: Actor } & z.input<typeof registerOrderSchema>;
export type UpdateOrderInput = { actor: Actor } & z.input<typeof updateOrderSchema>;

/** Resuelve la clienta (existente o nueva, en esta misma transacción) y arma las líneas con precios del servidor. */
async function prepareBody(tx: Tx, actor: Actor, data: OrderBody) {
  const customer = data.customerId ? await getCustomer(tx, data.customerId) : await createCustomer(tx, { actor, customer: data.newCustomer! });

  const variantIds = data.lines.map((l) => l.variantId);
  if (new Set(variantIds).size !== variantIds.length) {
    throw new AppError("VALIDATION", "Una prenda aparece repetida en el pedido: suma sus cantidades en una sola línea.");
  }
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds }, active: true, product: { active: true } },
    select: { id: true, sku: true, priceOverride: true, product: { select: { basePrice: true } } },
  });
  if (variants.length !== variantIds.length) throw new AppError("NOT_FOUND", "Una o más prendas no existen o están inactivas.");
  const byId = new Map(variants.map((v) => [v.id, v]));

  const unit = data.lines.map((l) => {
    const v = byId.get(l.variantId)!;
    return { unitPrice: effectivePrice({ priceOverride: v.priceOverride, basePrice: v.product.basePrice }), quantity: l.qty, discountBps: l.discountBps };
  });
  const priced = priceOrder(unit, data.shippingCost);
  if (priced.total <= 0) throw new AppError("VALIDATION", "El total del pedido debe ser mayor a $0.");

  // Belén puede dar descuentos sin aprobación; si superan el límite de la vendedora queda en audit_log (igual que en el POS).
  const limitBps = await getDiscountLimitBps(tx);
  const overLimit = data.lines.filter((l) => isDiscountOverLimit(l.discountBps, limitBps));
  return { customer, priced, byId, limitBps, overLimit };
}

type Prepared = Awaited<ReturnType<typeof prepareBody>>;

function lineRows(orderId: string, data: OrderBody, p: Prepared, sourceLocationId: string) {
  return data.lines.map((l, i) => ({
    orderId,
    variantId: l.variantId,
    quantity: l.qty,
    unitPrice: p.priced.lines[i].unitPrice,
    discountBps: l.discountBps,
    discountAmount: p.priced.lines[i].discount,
    lineTotal: p.priced.lines[i].lineTotal,
    sourceLocationId,
  }));
}

async function auditDiscounts(tx: Tx, actor: Actor, locationId: string, orderId: string, number: string, p: Prepared) {
  if (p.overLimit.length === 0) return;
  await tx.auditLog.create({
    data: {
      userId: actor.id,
      locationId,
      action: "DISCOUNT_OVERRIDE",
      entity: "online_order",
      entityId: orderId,
      after: {
        orderNumber: number,
        limitBps: p.limitBps,
        maxDiscountBps: Math.max(...p.overLimit.map((l) => l.discountBps)),
        lines: p.overLimit.map((l) => ({ sku: p.byId.get(l.variantId)!.sku, discountBps: l.discountBps })),
      },
    },
  });
}

/** Registra el pedido en PENDIENTE_PAGO. Idempotente por `idempotencyKey`. */
export async function registerOrder(input: RegisterOrderInput): Promise<IdempotentResult<OrderDetail>> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  const { idempotencyKey, ...body } = parseInput(registerOrderSchema, input);

  return runIdempotent({
    find: async () => {
      const existing = await db.onlineOrder.findUnique({ where: { idempotencyKey }, select: { id: true } });
      return existing ? loadOrderDetail(db, existing.id) : null;
    },
    execute: async () => {
      const orderId = await db.$transaction(async (tx) => {
        const location = await getFulfillmentLocation(tx);
        assertAccess(input.actor, { roles: ["ADMIN"], locationId: location.id });
        const p = await prepareBody(tx, input.actor, body);
        const number = await nextDocumentNumber(tx, "ORDER", "PED");
        const order = await tx.onlineOrder.create({
          data: {
            number,
            channel: body.channel,
            customerId: p.customer.id,
            status: OrderStatus.PENDIENTE_PAGO,
            fulfillmentLocationId: location.id,
            deliveryMethod: "DESPACHO",
            shippingAddress: body.shippingAddress,
            shippingCost: p.priced.shippingCost,
            subtotal: p.priced.subtotal,
            discountTotal: p.priced.discountTotal,
            total: p.priced.total,
            notes: body.notes ?? null,
            createdBy: input.actor.id,
            idempotencyKey,
          },
          select: { id: true },
        });
        await tx.onlineOrderLine.createMany({ data: lineRows(order.id, body, p, location.id) });
        await recordEvent(tx, { orderId: order.id, status: OrderStatus.PENDIENTE_PAGO, userId: input.actor.id, note: "Pedido registrado" });
        await auditDiscounts(tx, input.actor, location.id, order.id, number, p);
        return order.id;
      }, TX_OPTIONS);
      return loadOrderDetail(db, orderId);
    },
  });
}

/**
 * Edita un pedido PENDIENTE_PAGO. En ese estado no hay reservas ni traslados ligados, así que las líneas se
 * reescriben (igual que el borrador de un traslado). Si el pedido ya no está pendiente de pago → CONFLICT.
 */
export async function updateOrder(input: UpdateOrderInput): Promise<OrderDetail> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  const { orderId, ...body } = parseInput(updateOrderSchema, input);

  await db.$transaction(async (tx) => {
    const location = await getFulfillmentLocation(tx);
    assertAccess(input.actor, { roles: ["ADMIN"], locationId: location.id });
    const p = await prepareBody(tx, input.actor, body);
    // El cambio condicional bloquea el pedido: si otro usuario lo paga o cancela al mismo tiempo, uno recibe CONFLICT.
    await transition(
      tx,
      orderId,
      OrderStatus.PENDIENTE_PAGO,
      OrderStatus.PENDIENTE_PAGO,
      {
        channel: body.channel,
        customerId: p.customer.id,
        shippingAddress: body.shippingAddress,
        shippingCost: p.priced.shippingCost,
        subtotal: p.priced.subtotal,
        discountTotal: p.priced.discountTotal,
        total: p.priced.total,
        notes: body.notes ?? null,
      },
      "editar",
    );
    await tx.onlineOrderLine.deleteMany({ where: { orderId } });
    await tx.onlineOrderLine.createMany({ data: lineRows(orderId, body, p, location.id) });
    await recordEvent(tx, { orderId, status: OrderStatus.PENDIENTE_PAGO, userId: input.actor.id, note: "Pedido editado" });
    const order = await tx.onlineOrder.findUniqueOrThrow({ where: { id: orderId }, select: { number: true } });
    await auditDiscounts(tx, input.actor, location.id, orderId, order.number, p);
  }, TX_OPTIONS);
  return loadOrderDetail(db, orderId);
}
