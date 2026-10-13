import { db, type Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { runIdempotent, type IdempotentResult } from "@/lib/idempotency";
import { Prisma, type OrderStatus } from "@/generated/prisma/client";
import { loadOrderDetail } from "./queries";
import type { OrderDetail } from "./types";

// Utilidades internas de orders (no se exportan desde index.ts).

export const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5_000,
  timeout: 15_000,
} as const;

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDIENTE_PAGO: "pendiente de pago",
  PAGADO: "pagado",
  ESPERANDO_TRASPASO: "esperando traslado",
  LISTO_PARA_PREPARAR: "listo para preparar",
  PREPARADO: "preparado",
  DESPACHADO: "despachado",
  EN_CAMINO_A_TIENDA: "en camino a la tienda",
  LISTO_PARA_RETIRO: "listo para retiro",
  ENTREGADO: "entregado",
  CANCELADO: "cancelado",
};

/** Ubicación contable y de despacho de los pedidos online (la que tiene `fulfills_online`: BODEGA). */
export async function getFulfillmentLocation(tx: Pick<Tx, "location">): Promise<{ id: string; name: string; code: string }> {
  const loc = await tx.location.findFirst({
    where: { fulfillsOnline: true, active: true },
    select: { id: true, name: true, code: true },
  });
  if (!loc) throw new AppError("NOT_FOUND", "No hay una ubicación que despache pedidos online.");
  return loc;
}

/** Historial de estados (solo INSERT). La clave de idempotencia de la transición vive aquí (UNIQUE). */
export function recordEvent(
  tx: Pick<Tx, "onlineOrderEvent">,
  e: { orderId: string; status: OrderStatus; userId: string; note?: string | null; idempotencyKey?: string },
) {
  return tx.onlineOrderEvent.create({
    data: { orderId: e.orderId, status: e.status, userId: e.userId, note: e.note ?? null, idempotencyKey: e.idempotencyKey ?? null },
    select: { id: true },
  });
}

/**
 * Cambio de estado CONDICIONAL (`WHERE status IN from`): bloquea la fila del pedido y, si otra operación ya lo
 * movió, no afecta filas → CONFLICT. Es la garantía real contra dobles clics y operaciones simultáneas.
 */
export async function transition(
  tx: Pick<Tx, "onlineOrder">,
  orderId: string,
  from: OrderStatus | OrderStatus[],
  to: OrderStatus,
  data: Prisma.OnlineOrderUncheckedUpdateManyInput = {},
  action = "cambiar de estado",
): Promise<void> {
  const froms = Array.isArray(from) ? from : [from];
  const { count } = await tx.onlineOrder.updateMany({
    where: { id: orderId, status: { in: froms } },
    data: { ...data, status: to },
  });
  if (count === 0) {
    const current = await tx.onlineOrder.findUnique({ where: { id: orderId }, select: { number: true, status: true } });
    if (!current) throw new AppError("NOT_FOUND", "El pedido no existe.", { orderId });
    throw new AppError("CONFLICT", `El pedido ${current.number} está ${STATUS_LABEL[current.status]}: no se puede ${action}.`, {
      orderId,
      status: current.status,
    });
  }
}

/**
 * Comando idempotente sobre un pedido (confirmar, preparar, despachar, entregar, cancelar). La huella es el evento
 * del historial con `idempotency_key` UNIQUE: repetir la clave devuelve el pedido sin volver a ejecutar nada.
 * El pedido se lee con el pool, ya confirmada la transacción.
 */
export function orderCommand(op: {
  orderId: string;
  idempotencyKey: string;
  execute: (tx: Tx) => Promise<void>;
}): Promise<IdempotentResult<OrderDetail>> {
  return runIdempotent({
    find: async () => {
      const done = await db.onlineOrderEvent.findUnique({ where: { idempotencyKey: op.idempotencyKey }, select: { orderId: true } });
      if (!done) return null;
      if (done.orderId !== op.orderId) throw new AppError("CONFLICT", "Esa clave de operación ya fue usada en otro pedido.");
      return loadOrderDetail(db, op.orderId);
    },
    execute: async () => {
      await db.$transaction(op.execute, TX_OPTIONS);
      return loadOrderDetail(db, op.orderId);
    },
  });
}
