import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { runIdempotent, type IdempotentResult } from "@/lib/idempotency";
import { parseInput } from "@/lib/validation";
import { consumeApproval } from "@/modules/approvals";
import { findOperationMovements, reverseSale } from "@/modules/inventory";
import { assertVoidable, voidBinding } from "./approvals";
import { loadSaleView, lockOpenCashSession, TX_OPTIONS } from "./internal";
import type { SaleView } from "./types";

const id = z.string().trim().min(1);
const voidSchema = z.object({
  saleId: id,
  reason: z.string().trim().min(3, "Escribe el motivo de la anulación").max(300),
  approvalId: id.optional(),
  idempotencyKey: z.string().trim().min(8, "idempotencyKey inválida").max(200),
});

/**
 * ANULAR una venta POS del mismo día (RN-12, RF-POS-09). Una sola transacción:
 *   1. VENDEDORA: exige una aprobación de Belén APROBADA, de uso único, de esta venta y de su monto (`consumeApproval`).
 *      ADMIN: la ejecuta directamente, sin solicitud (regla 10b), y queda en audit_log igual.
 *   2. COMPLETADA → ANULADA (cambio condicional: anular dos veces → CONFLICT). La venta nunca se borra.
 *   3. Stock repuesto con movimiento inverso ANULACION_VENTA (InventoryService.reverseSale).
 *   4. Si se pagó en efectivo, el dinero sale de la caja ABIERTA (se guarda en `void_cash_session_id`); sin caja abierta se
 *      rechaza. Tarjeta o transferencia no tocan la caja.
 * Idempotente por `idempotencyKey` (huella: los movimientos de reposición).
 */
export async function voidSale(input: {
  actor: Actor;
  saleId: string;
  reason: string;
  approvalId?: string;
  idempotencyKey: string;
}): Promise<IdempotentResult<SaleView>> {
  assertAccess(input.actor, { roles: ["ADMIN", "VENDEDORA"] });
  const data = parseInput(voidSchema, input);
  const head = await db.sale.findUnique({ where: { id: data.saleId }, select: { locationId: true } });
  if (!head) throw new AppError("NOT_FOUND", "La venta no existe.");
  assertAccess(input.actor, { roles: ["ADMIN", "VENDEDORA"], locationId: head.locationId });
  const isAdmin = input.actor.role === "ADMIN";

  return runIdempotent({
    find: async () => ((await findOperationMovements(data.idempotencyKey)) ? loadSaleView(db, { id: data.saleId }) : null),
    execute: async () => {
      await db.$transaction(async (tx) => {
        const sale = await tx.sale.findUniqueOrThrow({
          where: { id: data.saleId },
          include: { payments: true, lines: { select: { variantId: true, quantity: true } } },
        });
        assertVoidable(sale);

        const amountPaid = sale.payments.reduce((a, p) => a + p.amount, 0);
        const cashPaid = sale.payments.filter((p) => p.method === "EFECTIVO").reduce((a, p) => a + p.amount, 0);
        let cashSessionId: string | null = null;
        if (cashPaid > 0) {
          const session = await lockOpenCashSession(tx, sale.locationId, "share");
          if (!session) throw new AppError("CONFLICT", "No hay caja abierta: abre la caja para anular una venta pagada en efectivo.");
          cashSessionId = session.id;
        }
        if (!isAdmin && !data.approvalId) {
          throw new AppError("APROBACION_REQUERIDA", "Anular una venta requiere la aprobación de Belén.");
        }

        // 1. Aprobación de uso único (VENDEDORA), en la misma transacción. Va ANTES de marcar la venta: así una aprobación
        //    mala (usada, de otra venta, vencida…) falla con su motivo exacto y no choca con el índice único void_approval_id.
        if (!isAdmin) {
          await consumeApproval(tx, {
            actor: input.actor,
            approvalId: data.approvalId!,
            type: "ANULACION",
            locationId: sale.locationId,
            amount: amountPaid,
            binding: voidBinding(sale.id),
            usedRefType: "SALE",
            usedRefId: sale.id,
          });
        }

        // 2. Cambio de estado condicional de la venta (la bloquea): anular dos veces → CONFLICT.
        const { count } = await tx.sale.updateMany({
          where: { id: sale.id, status: "COMPLETADA" },
          data: {
            status: "ANULADA",
            voidedAt: new Date(),
            voidedBy: input.actor.id,
            voidReason: data.reason,
            voidApprovalId: isAdmin ? null : data.approvalId,
            voidCashSessionId: cashSessionId,
          },
        });
        if (count === 0) throw new AppError("CONFLICT", `La venta ${sale.number} ya está anulada.`);

        // 3. Movimiento inverso de stock.
        await reverseSale(tx, {
          actor: input.actor,
          locationId: sale.locationId,
          saleId: sale.id,
          lines: sale.lines.map((l) => ({ variantId: l.variantId, qty: l.quantity })),
          reason: `Anulación de la venta ${sale.number}: ${data.reason}`,
          idempotencyKey: data.idempotencyKey,
        });

        await tx.auditLog.create({
          data: {
            userId: input.actor.id,
            locationId: sale.locationId,
            action: "SALE_VOID",
            entity: "sale",
            entityId: sale.id,
            before: { status: "COMPLETADA" },
            after: {
              saleNumber: sale.number,
              amountPaid,
              cashRefunded: cashPaid,
              reason: data.reason,
              // Directa del ADMIN (sin solicitud) o con aprobación de Belén pedida por una vendedora.
              direct: isAdmin,
              approvalId: isAdmin ? null : data.approvalId,
            },
          },
        });
      }, TX_OPTIONS);
      const view = await loadSaleView(db, { id: data.saleId });
      if (!view) throw new AppError("NOT_FOUND", "No se pudo leer la venta anulada.");
      return view;
    },
  });
}

/**
 * Anula la venta de un pedido online cancelado cuando Belén registra el reembolso (la llama `orders` en SU transacción).
 * No mueve stock (la cancelación ya lo repuso) ni toca la caja de la tienda. Solo ADMIN, sin solicitud (regla 10b).
 */
export async function voidOnlineSale(
  tx: Pick<Tx, "sale">,
  input: { actor: Actor; onlineOrderId: string; reason: string },
): Promise<{ saleId: string; number: string; amountPaid: number }> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  const sale = await tx.sale.findUnique({ where: { onlineOrderId: input.onlineOrderId }, include: { payments: true } });
  if (!sale) throw new AppError("NOT_FOUND", "El pedido no tiene una venta que anular.");
  const { count } = await tx.sale.updateMany({
    where: { id: sale.id, status: "COMPLETADA" },
    data: { status: "ANULADA", voidedAt: new Date(), voidedBy: input.actor.id, voidReason: input.reason },
  });
  if (count === 0) throw new AppError("CONFLICT", `La venta ${sale.number} ya está anulada.`);
  return { saleId: sale.id, number: sale.number, amountPaid: sale.payments.reduce((a, p) => a + p.amount, 0) };
}
