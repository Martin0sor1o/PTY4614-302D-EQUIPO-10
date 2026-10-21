import type { z } from "zod";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import type { IdempotentResult } from "@/lib/idempotency";
import { formatCLP } from "@/lib/money";
import { parseInput } from "@/lib/validation";
import { OrderStatus } from "@/generated/prisma/client";
import { voidOnlineSale } from "@/modules/sales";
import { orderCommand, recordEvent } from "./internal";
import { refundOrderSchema } from "./schemas";
import type { OrderDetail } from "./types";

export type RefundOrderInput = { actor: Actor } & z.input<typeof refundOrderSchema>;

/**
 * REEMBOLSO de un pedido cancelado y pagado (RF-PED-09, Etapa 6). Lo registra Belén directamente: el ADMIN no necesita
 * solicitud (regla 10b), pero queda en audit_log. Una transacción:
 *   · la `Sale` del pedido pasa de COMPLETADA a ANULADA (cambio condicional) y el aviso "reembolso pendiente" desaparece;
 *   · el pedido guarda cuándo, quién, el medio y la referencia (texto libre: P-17 sigue pendiente);
 *   · no mueve stock: la cancelación ya lo repuso o liberó.
 * Idempotente (evento del historial con la clave) y condicional: reembolsar dos veces → CONFLICT.
 */
export async function refundOrder(input: RefundOrderInput): Promise<IdempotentResult<OrderDetail>> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  const data = parseInput(refundOrderSchema, input);
  return orderCommand({
    orderId: data.orderId,
    idempotencyKey: data.idempotencyKey,
    execute: async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string; number: string; status: OrderStatus; refunded_at: Date | null; fulfillment_location_id: string }[]>`
        SELECT id, number, status, refunded_at, fulfillment_location_id FROM online_orders WHERE id = ${data.orderId} FOR UPDATE`;
      if (!locked) throw new AppError("NOT_FOUND", "El pedido no existe.", { orderId: data.orderId });
      assertAccess(input.actor, { roles: ["ADMIN"], locationId: locked.fulfillment_location_id });
      if (locked.status !== OrderStatus.CANCELADO) {
        throw new AppError("CONFLICT", `El pedido ${locked.number} no está cancelado: solo se reembolsa un pedido cancelado y pagado.`);
      }
      if (locked.refunded_at) throw new AppError("CONFLICT", `El pedido ${locked.number} ya fue reembolsado.`);
      const hasSale = await tx.sale.count({ where: { onlineOrderId: locked.id } });
      if (hasSale === 0) throw new AppError("VALIDATION", `El pedido ${locked.number} no tiene un pago que reembolsar.`);

      const sale = await voidOnlineSale(tx, { actor: input.actor, onlineOrderId: locked.id, reason: `Reembolso del pedido ${locked.number} cancelado` });
      await tx.onlineOrder.update({
        where: { id: locked.id },
        data: { refundedAt: new Date(), refundedBy: input.actor.id, refundMethod: data.method, refundReference: data.reference || null },
      });
      await tx.auditLog.create({
        data: {
          userId: input.actor.id,
          locationId: locked.fulfillment_location_id,
          action: "ORDER_REFUND",
          entity: "online_order",
          entityId: locked.id,
          before: { saleStatus: "COMPLETADA" },
          after: {
            number: locked.number,
            saleNumber: sale.number,
            amount: sale.amountPaid,
            method: data.method,
            reference: data.reference || null,
            // Directo del ADMIN: sin solicitud de aprobación (regla 10b).
            direct: true,
          },
        },
      });
      await recordEvent(tx, {
        orderId: locked.id,
        status: OrderStatus.CANCELADO,
        userId: input.actor.id,
        note: `Reembolso registrado: ${formatCLP(sale.amountPaid)} por ${data.method}${data.reference ? ` (${data.reference})` : ""} · venta ${sale.number} anulada`,
        idempotencyKey: data.idempotencyKey,
      });
    },
  });
}
