import type { z } from "zod";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import type { IdempotentResult } from "@/lib/idempotency";
import { parseInput } from "@/lib/validation";
import { OrderStatus } from "@/generated/prisma/client";
import { cancelOrderTransfers, listActiveOrderReservations, releaseReservations, returnOrderToStock } from "@/modules/inventory";
import { orderCommand, recordEvent, STATUS_LABEL, transition } from "./internal";
import { cancelOrderSchema } from "./schemas";
import type { OrderDetail } from "./types";

export type CancelOrderInput = { actor: Actor } & z.input<typeof cancelOrderSchema>;

/** Estados desde los que Belén puede cancelar. DESPACHADO y ENTREGADO NO se cancelan: se gestionan como devolución. */
const CANCELLABLE: readonly OrderStatus[] = [
  OrderStatus.PENDIENTE_PAGO,
  OrderStatus.ESPERANDO_TRASPASO,
  OrderStatus.LISTO_PARA_PREPARAR,
  OrderStatus.PREPARADO,
];

/**
 * CANCELAR (solo ADMIN, con motivo; RF-PED-09). Una transacción:
 *   · PENDIENTE_PAGO       → sin efectos de stock.
 *   · LISTO_PARA_PREPARAR  → libera las reservas activas.
 *   · ESPERANDO_TRASPASO   → anula el traslado si sigue en borrador; si ya viaja (o llegó con diferencias) desliga sus
 *                            líneas del pedido: al llegar a bodega la prenda queda como stock libre. Libera las reservas
 *                            activas (tienda y/o bodega).
 *   · PREPARADO            → reingresa a bodega lo consumido (REINGRESO_PEDIDO_CANCELADO).
 * La `Sale` NO se toca: si el pedido estaba pagado queda con aviso de "reembolso pendiente" hasta el reembolso
 * formal con aprobación de la Etapa 6 (regla 10b). Todo queda en el historial y en audit_log.
 */
export async function cancelOrder(input: CancelOrderInput): Promise<IdempotentResult<OrderDetail>> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  const data = parseInput(cancelOrderSchema, input);
  return orderCommand({
    orderId: data.orderId,
    idempotencyKey: data.idempotencyKey,
    execute: async (tx) => {
      // Primero se BLOQUEA el pedido y recién entonces se lee su estado: lo que hay que deshacer (reservas, traslados o
      // reingreso) depende del estado, y una operación simultánea (p. ej. recibir el traslado) no debe cambiárselo
      // entre la lectura y la cancelación. Es el primer bloqueo del orden global: pedido → traslados → reservas → stock.
      const [locked] = await tx.$queryRaw<{ id: string; number: string; status: OrderStatus; fulfillment_location_id: string }[]>`
        SELECT id, number, status, fulfillment_location_id FROM online_orders WHERE id = ${data.orderId} FOR UPDATE`;
      if (!locked) throw new AppError("NOT_FOUND", "El pedido no existe.", { orderId: data.orderId });
      const order = { id: locked.id, number: locked.number, status: locked.status, fulfillmentLocationId: locked.fulfillment_location_id };
      assertAccess(input.actor, { roles: ["ADMIN"], locationId: order.fulfillmentLocationId });
      if (!CANCELLABLE.includes(order.status)) {
        throw new AppError(
          "CONFLICT",
          order.status === OrderStatus.CANCELADO
            ? `El pedido ${order.number} ya está cancelado.`
            : `El pedido ${order.number} está ${STATUS_LABEL[order.status]}: ya salió de la bodega y no se cancela (se gestiona como devolución).`,
          { orderId: order.id, status: order.status },
        );
      }

      // Cambio condicional contra el estado leído: si otra operación lo movió, CONFLICT.
      await transition(
        tx,
        order.id,
        order.status,
        OrderStatus.CANCELADO,
        { cancelledAt: new Date(), cancelledBy: input.actor.id, cancelReason: data.reason },
        "cancelar",
      );

      const lines = await tx.onlineOrderLine.findMany({
        where: { orderId: order.id },
        select: { id: true, variantId: true, quantity: true },
        orderBy: { variantId: "asc" },
      });
      if (order.status === OrderStatus.LISTO_PARA_PREPARAR || order.status === OrderStatus.ESPERANDO_TRASPASO) {
        // Orden de bloqueo: pedido (ya bloqueado arriba) → traslados → reservas → stock.
        await cancelOrderTransfers(tx, { actor: input.actor, onlineOrderId: order.id, reason: data.reason });
        const reservations = await listActiveOrderReservations(tx, lines.map((l) => l.id));
        if (reservations.length > 0) {
          await releaseReservations(tx, {
            actor: input.actor,
            reservationIds: reservations.map((r) => r.id),
            reason: `Pedido ${order.number} cancelado: ${data.reason}`,
          });
        }
      } else if (order.status === OrderStatus.PREPARADO) {
        await returnOrderToStock(tx, {
          actor: input.actor,
          locationId: order.fulfillmentLocationId,
          onlineOrderId: order.id,
          lines: lines.map((l) => ({ variantId: l.variantId, qty: l.quantity })),
          reason: `Pedido ${order.number} cancelado: ${data.reason}`,
          idempotencyKey: data.idempotencyKey,
        });
      }

      const sale = await tx.sale.findUnique({ where: { onlineOrderId: order.id }, select: { number: true, total: true, status: true } });
      await tx.auditLog.create({
        data: {
          userId: input.actor.id,
          locationId: order.fulfillmentLocationId,
          action: "ORDER_CANCEL",
          entity: "online_order",
          entityId: order.id,
          before: { status: order.status },
          after: {
            number: order.number,
            reason: data.reason,
            saleNumber: sale?.number ?? null,
            refundPending: sale !== null && sale.status === "COMPLETADA" ? sale.total : null,
          },
        },
      });
      await recordEvent(tx, {
        orderId: order.id,
        status: OrderStatus.CANCELADO,
        userId: input.actor.id,
        note: `Cancelado: ${data.reason}${sale ? ` · reembolso pendiente (venta ${sale.number})` : ""}`,
        idempotencyKey: data.idempotencyKey,
      });
    },
  });
}
