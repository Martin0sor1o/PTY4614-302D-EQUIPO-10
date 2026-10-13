import type { z } from "zod";
import type { Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import type { IdempotentResult } from "@/lib/idempotency";
import { parseInput } from "@/lib/validation";
import { OrderStatus } from "@/generated/prisma/client";
import { consumeReservations, listActiveOrderReservations } from "@/modules/inventory";
import { orderCommand, recordEvent, transition } from "./internal";
import { getCouriers } from "./queries";
import { deliverOrderSchema, dispatchOrderSchema, prepareOrderSchema } from "./schemas";
import type { OrderDetail } from "./types";

// Preparar (picking), despachar y entregar. Preparar y despachar los hace ADMIN o BODEGA en la bodega.

const PICKING_ROLES = ["ADMIN", "BODEGA"] as const;

export type PrepareOrderInput = { actor: Actor } & z.input<typeof prepareOrderSchema>;
export type DispatchOrderInput = { actor: Actor } & z.input<typeof dispatchOrderSchema>;
export type DeliverOrderInput = { actor: Actor } & z.input<typeof deliverOrderSchema>;

async function loadForFulfillment(tx: Tx, actor: Actor, orderId: string) {
  const order = await tx.onlineOrder.findUnique({ where: { id: orderId }, select: { id: true, number: true, fulfillmentLocationId: true } });
  if (!order) throw new AppError("NOT_FOUND", "El pedido no existe.", { orderId });
  assertAccess(actor, { roles: PICKING_ROLES, locationId: order.fulfillmentLocationId });
  return order;
}

/**
 * PREPARAR (picking): LISTO_PARA_PREPARAR → PREPARADO. Lo escaneado debe coincidir EXACTO con las prendas del pedido:
 * una prenda ajena, de más o faltante se rechaza. Consume las reservas (`consumeReservations`): baja el stock con
 * movimientos VENTA_ONLINE (RN-08). Idempotente: repetir la clave no consume dos veces.
 */
export async function prepareOrder(input: PrepareOrderInput): Promise<IdempotentResult<OrderDetail>> {
  assertAccess(input.actor, { roles: PICKING_ROLES });
  const data = parseInput(prepareOrderSchema, input);
  return orderCommand({
    orderId: data.orderId,
    idempotencyKey: data.idempotencyKey,
    execute: async (tx) => {
      const order = await loadForFulfillment(tx, input.actor, data.orderId);
      await transition(
        tx,
        order.id,
        OrderStatus.LISTO_PARA_PREPARAR,
        OrderStatus.PREPARADO,
        { preparedAt: new Date(), preparedBy: input.actor.id },
        "preparar",
      );

      const lines = await tx.onlineOrderLine.findMany({
        where: { orderId: order.id },
        select: { id: true, variantId: true, quantity: true, variant: { select: { sku: true } } },
        orderBy: { variantId: "asc" },
      });
      const scanned = new Map<string, number>();
      for (const s of data.scanned) scanned.set(s.variantId, (scanned.get(s.variantId) ?? 0) + s.qty);

      const inOrder = new Set(lines.map((l) => l.variantId));
      for (const [variantId, qty] of scanned) {
        if (qty > 0 && !inOrder.has(variantId)) {
          throw new AppError("VALIDATION", `Esa prenda no es del pedido ${order.number}. Sepárala y no la incluyas.`, { variantId });
        }
      }
      for (const l of lines) {
        const got = scanned.get(l.variantId) ?? 0;
        if (got > l.quantity) {
          throw new AppError("VALIDATION", `${l.variant.sku}: escaneaste ${got} y el pedido tiene ${l.quantity}.`, { variantId: l.variantId });
        }
        if (got < l.quantity) {
          throw new AppError("VALIDATION", `${l.variant.sku}: faltan ${l.quantity - got} por escanear (${got} de ${l.quantity}).`, { variantId: l.variantId });
        }
      }

      // Cada línea debe tener reservada en bodega exactamente su cantidad (si no, el pedido no estaba realmente completo).
      const reservations = await listActiveOrderReservations(tx, lines.map((l) => l.id));
      for (const l of lines) {
        const reserved = reservations
          .filter((r) => r.orderLineId === l.id && r.locationId === order.fulfillmentLocationId)
          .reduce((a, r) => a + r.quantity, 0);
        if (reserved !== l.quantity) {
          throw new AppError("CONFLICT", `${l.variant.sku}: la reserva en bodega (${reserved}) no cuadra con el pedido (${l.quantity}).`, { lineId: l.id });
        }
      }
      await consumeReservations(tx, {
        actor: input.actor,
        reservationIds: reservations.map((r) => r.id),
        onlineOrderId: order.id,
        idempotencyKey: data.idempotencyKey,
      });
      for (const l of lines) await tx.onlineOrderLine.update({ where: { id: l.id }, data: { pickedQty: l.quantity } });

      await recordEvent(tx, {
        orderId: order.id,
        status: OrderStatus.PREPARADO,
        userId: input.actor.id,
        note: "Preparado en bodega (picking escaneado)",
        idempotencyKey: data.idempotencyKey,
      });
    },
  });
}

/** DESPACHAR: PREPARADO → DESPACHADO. Solo por courier (lista en `settings.couriers`) y con N° de seguimiento. */
export async function dispatchOrder(input: DispatchOrderInput): Promise<IdempotentResult<OrderDetail>> {
  assertAccess(input.actor, { roles: PICKING_ROLES });
  const data = parseInput(dispatchOrderSchema, input);
  return orderCommand({
    orderId: data.orderId,
    idempotencyKey: data.idempotencyKey,
    execute: async (tx) => {
      const order = await loadForFulfillment(tx, input.actor, data.orderId);
      const couriers = await getCouriers(tx);
      if (!couriers.includes(data.courier)) {
        throw new AppError("VALIDATION", `El courier “${data.courier}” no está en la lista (${couriers.join(", ") || "vacía"}).`);
      }
      await transition(
        tx,
        order.id,
        OrderStatus.PREPARADO,
        OrderStatus.DESPACHADO,
        { courier: data.courier, trackingNumber: data.trackingNumber, shippedAt: new Date() },
        "despachar",
      );
      await recordEvent(tx, {
        orderId: order.id,
        status: OrderStatus.DESPACHADO,
        userId: input.actor.id,
        note: `${data.courier} · seguimiento ${data.trackingNumber}`,
        idempotencyKey: data.idempotencyKey,
      });
    },
  });
}

/** ENTREGADO: DESPACHADO → ENTREGADO, marcado a mano (no hay integración con couriers en la demo). */
export async function markDelivered(input: DeliverOrderInput): Promise<IdempotentResult<OrderDetail>> {
  assertAccess(input.actor, { roles: PICKING_ROLES });
  const data = parseInput(deliverOrderSchema, input);
  return orderCommand({
    orderId: data.orderId,
    idempotencyKey: data.idempotencyKey,
    execute: async (tx) => {
      const order = await loadForFulfillment(tx, input.actor, data.orderId);
      await transition(
        tx,
        order.id,
        OrderStatus.DESPACHADO,
        OrderStatus.ENTREGADO,
        { deliveredAt: new Date(), deliveredBy: input.actor.id },
        "marcar como entregado",
      );
      await recordEvent(tx, {
        orderId: order.id,
        status: OrderStatus.ENTREGADO,
        userId: input.actor.id,
        note: "Entregado a la clienta",
        idempotencyKey: data.idempotencyKey,
      });
    },
  });
}
