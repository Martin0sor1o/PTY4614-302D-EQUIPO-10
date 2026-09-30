// API pública de InventoryService (CLAUDE.md regla 1): ÚNICO módulo que escribe stock_levels,
// inventory_movements, reservations, transfers y transfer_lines. Contrato: docs/03_ARQUITECTURA.md §5.

// ── Operaciones dentro de la transacción de quien llama (sales, orders, seed): reciben `tx` ──
export { loadInitialStock, receive, adjust, sell } from "./stock-operations";
export { reserve, releaseReservations, consumeReservations } from "./reservations";
export { createTransfer, sendTransfer, receiveTransfer, getTransfer, findTransferByIdempotencyKey } from "./transfers";

// ── Comandos para la UI: transacción propia + idempotencia ──
export {
  receiveStock,
  adjustStock,
  createTransferCommand,
  sendTransferCommand,
  receiveTransferCommand,
} from "./commands";

// ── Consultas (solo lectura) ──
export {
  getStockMatrix,
  cellFor,
  getKardex,
  findOperationMovements,
  findLedgerMismatches,
  findReservationMismatches,
  type StockCell,
  type StockMatrixRow,
  type Kardex,
  type KardexEntry,
  type LedgerMismatch,
  type ReservationMismatch,
} from "./queries";

export type {
  Actor,
  MovementRecord,
  MovementType,
  RefType,
  ReservationRecord,
  StockOperationResult,
  TransferLineRecord,
  TransferOperationResult,
  TransferRecord,
  TransferStatus,
} from "./types";
