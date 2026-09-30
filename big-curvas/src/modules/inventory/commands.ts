import { db, type Tx } from "@/lib/db";
import { runIdempotent, type IdempotentResult } from "@/lib/idempotency";
import { Prisma } from "@/generated/prisma/client";
import { findOperationMovements } from "./queries";
import { adjust, receive } from "./stock-operations";
import { createTransfer, findTransferByIdempotencyKey, getTransfer, receiveTransfer, sendTransfer } from "./transfers";
import type { StockOperationResult, TransferOperationResult, TransferRecord } from "./types";

// Comandos que la UI invoca directamente (vía Server Action): abren SU PROPIA transacción y son idempotentes.
// Las operaciones que forman parte de otro documento (sell, reserve, consume…) las llama sales/orders con su tx.

/**
 * READ COMMITTED (el default de Postgres, explícito para dejar la intención): el UPDATE condicional bloquea la
 * fila y re-evalúa el WHERE sobre el valor confirmado, así que no hacen falta SERIALIZABLE ni reintentos.
 */
export const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5_000,
  timeout: 10_000,
} as const;

export function inTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(fn, TX_OPTIONS);
}

async function stockCommand(
  idempotencyKey: string,
  fn: (tx: Tx) => Promise<StockOperationResult>,
): Promise<IdempotentResult<StockOperationResult>> {
  return runIdempotent({
    find: async () => {
      const movements = await findOperationMovements(idempotencyKey);
      return movements ? { movements } : null;
    },
    execute: () => inTransaction(fn),
  });
}

async function transferCommand(
  idempotencyKey: string,
  transferId: string,
  fn: (tx: Tx) => Promise<TransferOperationResult>,
): Promise<IdempotentResult<TransferOperationResult>> {
  return runIdempotent({
    find: async () => {
      const movements = await findOperationMovements(idempotencyKey);
      return movements ? { transfer: await getTransfer(db, transferId), movements } : null;
    },
    execute: () => inTransaction(fn),
  });
}

export function receiveStock(input: Parameters<typeof receive>[1]) {
  return stockCommand(input.idempotencyKey, (tx) => receive(tx, input));
}

export function adjustStock(input: Parameters<typeof adjust>[1]) {
  return stockCommand(input.idempotencyKey, (tx) => adjust(tx, input));
}

export function createTransferCommand(input: Parameters<typeof createTransfer>[1]): Promise<IdempotentResult<TransferRecord>> {
  return runIdempotent({
    find: () => findTransferByIdempotencyKey(db, input.idempotencyKey),
    execute: () => inTransaction((tx) => createTransfer(tx, input)),
  });
}

export function sendTransferCommand(input: Parameters<typeof sendTransfer>[1]) {
  return transferCommand(input.idempotencyKey, input.transferId, (tx) => sendTransfer(tx, input));
}

export function receiveTransferCommand(input: Parameters<typeof receiveTransfer>[1]) {
  return transferCommand(input.idempotencyKey, input.transferId, (tx) => receiveTransfer(tx, input));
}
