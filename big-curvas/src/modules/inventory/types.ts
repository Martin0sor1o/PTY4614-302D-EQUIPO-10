import type { Actor } from "@/lib/access";
import type {
  MovementType,
  RefType,
  ReservationStatus,
  TransferReason,
  TransferStatus,
} from "@/generated/prisma/client";

export type { Actor };
export type { MovementType, RefType, ReservationStatus, TransferReason, TransferStatus };

export interface MovementRecord {
  id: string;
  variantId: string;
  locationId: string;
  type: MovementType;
  /** Con signo: + entra, − sale. */
  quantity: number;
  onHandAfter: number;
  refType: RefType;
  refId: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
}

export interface StockOperationResult {
  movements: MovementRecord[];
}

export interface ReservationRecord {
  id: string;
  variantId: string;
  locationId: string;
  quantity: number;
  status: ReservationStatus;
  orderLineId: string | null;
  expiresAt: Date | null;
}

export interface TransferLineRecord {
  id: string;
  variantId: string;
  qtySent: number;
  qtyReceived: number | null;
  orderLineId: string | null;
  reservationId: string | null;
  differenceResolution: DifferenceResolution | null;
}

export interface TransferRecord {
  id: string;
  number: string;
  fromLocationId: string;
  toLocationId: string;
  status: TransferStatus;
  reason: TransferReason;
  lines: TransferLineRecord[];
}

export interface TransferOperationResult {
  transfer: TransferRecord;
  movements: MovementRecord[];
}

export type DifferenceResolution = "MERMA" | "REENVIO" | "ERROR_ENVIO";

export interface ResolveTransferResult extends TransferOperationResult {
  /** Traslado nuevo en BORRADOR con lo que quedó en el origen, si alguna línea se resolvió como REENVIO. */
  reshipTransfer: TransferRecord | null;
}
