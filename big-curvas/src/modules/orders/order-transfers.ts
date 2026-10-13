import type { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { runIdempotent, type IdempotentResult } from "@/lib/idempotency";
import { parseInput } from "@/lib/validation";
import { OrderStatus, TransferStatus } from "@/generated/prisma/client";
import {
  findTransferOperation,
  findTransferResolution,
  getTransfer,
  receiveTransfer,
  receiveTransferCommand,
  resolveTransferDifference,
  resolveTransferDifferenceCommand,
  type ResolveTransferResult,
  type TransferOperationResult,
} from "@/modules/inventory";
import { allocateLines } from "./allocate";
import { orderCommand, recordEvent, TX_OPTIONS, transition } from "./internal";
import { loadCoverage } from "./queries";
import { fillShortageSchema } from "./schemas";
import type { OrderDetail } from "./types";

// Hito 2: traslados ligados a pedidos. El pedido reacciona cuando el traslado se RECIBE o se RESUELVE:
//   · recibido sin diferencias y todo reservado en bodega → LISTO_PARA_PREPARAR (automático).
//   · recibido con diferencias → sigue en ESPERANDO_TRASPASO, bloqueado hasta que Belén resuelva (RN-30).
// Las envolturas bloquean el PEDIDO primero y llaman a InventoryService con el mismo `tx`, de modo que el orden de
// bloqueo global se cumple: pedido → traslados → reservas → stock.

const ANY_ROLE = ["ADMIN", "VENDEDORA", "BODEGA"] as const;

async function lockOrder(tx: Tx, orderId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM online_orders WHERE id = ${orderId} FOR UPDATE`;
}

type SyncOutcome = "ready" | "blocked" | "waiting" | "inactive";

/**
 * Tras recibir o resolver un traslado: si el pedido espera traslado, no tiene diferencias sin resolver y todas sus
 * líneas están reservadas en bodega → LISTO_PARA_PREPARAR. No toca stock. Debe llamarse con el pedido ya bloqueado.
 */
async function syncAfterTransfer(tx: Tx, actor: Actor, orderId: string, note: string): Promise<{ outcome: SyncOutcome; shortage: number }> {
  const order = await tx.onlineOrder.findUnique({ where: { id: orderId }, select: { id: true, status: true, fulfillmentLocationId: true } });
  if (!order || order.status !== OrderStatus.ESPERANDO_TRASPASO) return { outcome: "inactive", shortage: 0 };

  const coverage = await loadCoverage(tx, orderId, order.fulfillmentLocationId);
  const shortage = coverage.reduce((a, c) => a + c.shortage, 0);
  const unresolved = await tx.transfer.count({ where: { onlineOrderId: orderId, status: TransferStatus.RECIBIDO_CON_DIFERENCIAS } });
  if (unresolved > 0) return { outcome: "blocked", shortage };

  if (coverage.every((c) => c.inFulfillment >= c.quantity)) {
    await transition(tx, orderId, OrderStatus.ESPERANDO_TRASPASO, OrderStatus.LISTO_PARA_PREPARAR, {}, "pasar a listo para preparar");
    await recordEvent(tx, { orderId, status: OrderStatus.LISTO_PARA_PREPARAR, userId: actor.id, note });
    return { outcome: "ready", shortage: 0 };
  }
  return { outcome: "waiting", shortage };
}

export type ReceiveTransferInput = Parameters<typeof receiveTransferCommand>[0];
export type ResolveTransferInput = Parameters<typeof resolveTransferDifferenceCommand>[0];

/**
 * Recibir un traslado en destino, avisando al pedido ligado (si lo hay). Una sola transacción e idempotente.
 * Si el traslado no es de un pedido, es exactamente `receiveTransferCommand`.
 */
export async function receiveTransferAndSync(input: ReceiveTransferInput): Promise<IdempotentResult<TransferOperationResult>> {
  const transfer = await getTransfer(db, input.transferId);
  const orderId = transfer.onlineOrderId;
  if (!orderId) return receiveTransferCommand(input);
  assertAccess(input.actor, { roles: ANY_ROLE, locationId: transfer.toLocationId });

  return runIdempotent({
    find: () => findTransferOperation(input.idempotencyKey, input.transferId),
    execute: () =>
      db.$transaction(async (tx) => {
        await lockOrder(tx, orderId);
        const result = await receiveTransfer(tx, input);
        const t = result.transfer;
        if (t.status === TransferStatus.RECIBIDO_CON_DIFERENCIAS) {
          const order = await tx.onlineOrder.findUnique({ where: { id: orderId }, select: { status: true } });
          if (order?.status === OrderStatus.ESPERANDO_TRASPASO) {
            await recordEvent(tx, {
              orderId,
              status: OrderStatus.ESPERANDO_TRASPASO,
              userId: input.actor.id,
              note: `Traslado ${t.number} recibido con diferencias: el pedido queda bloqueado hasta que Belén las resuelva`,
            });
          }
        } else {
          const { outcome } = await syncAfterTransfer(tx, input.actor, orderId, `Traslado ${t.number} recibido: todo el pedido está en bodega`);
          if (outcome === "waiting") {
            await recordEvent(tx, {
              orderId,
              status: OrderStatus.ESPERANDO_TRASPASO,
              userId: input.actor.id,
              note: `Traslado ${t.number} recibido; el pedido sigue esperando otras prendas`,
            });
          }
        }
        return result;
      }, TX_OPTIONS),
  });
}

/**
 * Resolver las diferencias de un traslado (solo ADMIN), avisando al pedido ligado. REENVIO de una línea de pedido
 * vuelve a apartar lo que se quedó en la tienda y liga el borrador de reenvío al pedido (lo hace InventoryService).
 */
export async function resolveTransferAndSync(input: ResolveTransferInput): Promise<IdempotentResult<ResolveTransferResult>> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  const transfer = await getTransfer(db, input.transferId);
  const orderId = transfer.onlineOrderId;
  if (!orderId) return resolveTransferDifferenceCommand(input);

  return runIdempotent({
    find: () => findTransferResolution(input.idempotencyKey, input.transferId),
    execute: () =>
      db.$transaction(async (tx) => {
        await lockOrder(tx, orderId);
        const result = await resolveTransferDifference(tx, input);
        const { outcome, shortage } = await syncAfterTransfer(
          tx,
          input.actor,
          orderId,
          `Diferencias de ${result.transfer.number} resueltas: todo el pedido está en bodega`,
        );
        if (outcome === "waiting" || outcome === "blocked") {
          const parts = [`Diferencias de ${result.transfer.number} resueltas`];
          if (result.reshipTransfer) parts.push(`reenvío ${result.reshipTransfer.number} en camino a la bodega`);
          if (shortage > 0) parts.push(`faltan ${shortage} unidad(es): usa “Completar faltante” o cancela el pedido`);
          await recordEvent(tx, { orderId, status: OrderStatus.ESPERANDO_TRASPASO, userId: input.actor.id, note: parts.join(" · ") });
        }
        return result;
      }, TX_OPTIONS),
  });
}

export type FillShortageInput = { actor: Actor } & z.input<typeof fillShortageSchema>;

/**
 * COMPLETAR FALTANTE (solo ADMIN): tras una MERMA o un ERROR_ENVIO que dejó unidades sin cubrir, aparta lo que falta
 * con las mismas reglas de "confirmar pago" (bodega, o una tienda si la bodega no alcanza para lo que falta; con
 * traslado nuevo). Si todo queda en bodega → LISTO_PARA_PREPARAR. Solo en ESPERANDO_TRASPASO y sin diferencias por resolver.
 */
export async function fillShortage(input: FillShortageInput): Promise<IdempotentResult<OrderDetail>> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  const data = parseInput(fillShortageSchema, input);
  return orderCommand({
    orderId: data.orderId,
    idempotencyKey: data.idempotencyKey,
    execute: async (tx) => {
      const order = await tx.onlineOrder.findUnique({ where: { id: data.orderId }, select: { id: true, number: true, fulfillmentLocationId: true } });
      if (!order) throw new AppError("NOT_FOUND", "El pedido no existe.", { orderId: data.orderId });
      assertAccess(input.actor, { roles: ["ADMIN"], locationId: order.fulfillmentLocationId });

      // Bloquea el pedido (pedido → traslados → reservas → stock) y exige que siga esperando traslado.
      await transition(tx, order.id, OrderStatus.ESPERANDO_TRASPASO, OrderStatus.ESPERANDO_TRASPASO, {}, "completar el faltante");
      const unresolved = await tx.transfer.count({ where: { onlineOrderId: order.id, status: TransferStatus.RECIBIDO_CON_DIFERENCIAS } });
      if (unresolved > 0) {
        throw new AppError("CONFLICT", `El pedido ${order.number} tiene un traslado con diferencias: resuélvelo primero en Traslados → Con diferencias.`);
      }

      const coverage = await loadCoverage(tx, order.id, order.fulfillmentLocationId);
      const short = coverage.filter((c) => c.shortage > 0);
      if (short.length === 0) throw new AppError("VALIDATION", `El pedido ${order.number} no tiene unidades por completar.`);
      const lines = await tx.onlineOrderLine.findMany({ where: { id: { in: short.map((c) => c.lineId) } }, select: { id: true, variantId: true } });

      const { transfers } = await allocateLines(tx, {
        actor: input.actor,
        order: { id: order.id, number: order.number, fulfillmentLocationId: order.fulfillmentLocationId },
        items: short.map((c) => ({ lineId: c.lineId, variantId: lines.find((l) => l.id === c.lineId)!.variantId, qty: c.shortage })),
        storeSources: new Map(data.lineSources.map((s) => [s.lineId, s.locationId])),
        keyBase: data.idempotencyKey,
        setLineSource: false,
      });

      const after = await loadCoverage(tx, order.id, order.fulfillmentLocationId);
      const ready = after.every((c) => c.inFulfillment >= c.quantity);
      const filled = short.reduce((a, c) => a + c.shortage, 0);
      if (ready) {
        await transition(tx, order.id, OrderStatus.ESPERANDO_TRASPASO, OrderStatus.LISTO_PARA_PREPARAR, {}, "completar el faltante");
      }
      await recordEvent(tx, {
        orderId: order.id,
        status: ready ? OrderStatus.LISTO_PARA_PREPARAR : OrderStatus.ESPERANDO_TRASPASO,
        userId: input.actor.id,
        note:
          `Faltante completado (${filled} unidad${filled === 1 ? "" : "es"})` +
          (transfers.length > 0 ? ` · traslado ${transfers.map((t) => t.number).join(", ")} desde la tienda` : " · apartado en bodega"),
        idempotencyKey: data.idempotencyKey,
      });
    },
  });
}
