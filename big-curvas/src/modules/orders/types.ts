import type { OrderStatus, PaymentMethod, SaleChannel, TransferStatus } from "@/generated/prisma/client";

export type { OrderStatus };

export interface LocationAvailability {
  locationId: string;
  name: string;
  /** on_hand − reserved. Solo se muestra al registrar o pagar: registrar NO aparta nada (RN-07). */
  available: number;
}

export interface OrderLineView {
  id: string;
  variantId: string;
  sku: string;
  barcode: string;
  productName: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  discountBps: number;
  discountAmount: number;
  lineTotal: number;
  sourceLocationId: string;
  sourceLocationName: string;
  pickedQty: number;
  /** Unidades en un traslado EN_TRANSITO ligado a esta línea (su reserva en la tienda ya se consumió al enviar). */
  inTransit: number;
  /** Unidades que ninguna reserva ni traslado cubre (p. ej. tras una MERMA): se completan con "Completar faltante". */
  shortage: number;
  /** Unidades con reserva ACTIVA, por ubicación. */
  reserved: { locationId: string; name: string; qty: number }[];
  /** Disponible actual por ubicación (bodega primero). */
  availability: LocationAvailability[];
}

export interface OrderEventView {
  status: OrderStatus;
  at: Date;
  userName: string;
  note: string | null;
}

export interface OrderTransferView {
  id: string;
  number: string;
  status: TransferStatus;
  fromLocationName: string;
  toLocationName: string;
}

export interface OrderDetail {
  id: string;
  number: string;
  channel: SaleChannel;
  status: OrderStatus;
  createdAt: Date;
  createdByName: string;
  /** Desde cuándo está en el estado actual (último evento del historial). */
  statusSince: Date;
  fulfillmentLocation: { id: string; name: string };
  customer: { id: string; name: string; instagramHandle: string | null; phone: string | null; address: string | null; commune: string | null };
  shippingAddress: string | null;
  notes: string | null;
  subtotal: number;
  discountTotal: number;
  shippingCost: number;
  total: number;
  payment: { method: PaymentMethod; reference: string | null; paidAt: Date | null } | null;
  preparedAt: Date | null;
  courier: string | null;
  trackingNumber: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancellation: { at: Date; reason: string | null; byName: string | null } | null;
  /** Reembolso registrado de un pedido cancelado (la venta pasó a ANULADA). */
  refund: { at: Date; byName: string | null; method: string; reference: string | null } | null;
  lines: OrderLineView[];
  events: OrderEventView[];
  sale: { id: string; number: string; status: "COMPLETADA" | "ANULADA"; total: number } | null;
  transfers: OrderTransferView[];
  /** Pedido cancelado cuya venta sigue COMPLETADA: el dinero se devuelve con el reembolso formal (Etapa 6). */
  refundPending: boolean;
  /** Pedido en ESPERANDO_TRASPASO con un traslado recibido con diferencias sin resolver. */
  blockedByTransferDifference: boolean;
  /** ESPERANDO_TRASPASO, sin diferencias por resolver y con unidades sin cubrir: Belén puede completar el faltante. */
  canFillShortage: boolean;
}

export interface OrderBoardItem {
  id: string;
  number: string;
  status: OrderStatus;
  channel: SaleChannel;
  customerName: string;
  instagramHandle: string | null;
  units: number;
  total: number;
  createdAt: Date;
  statusSince: Date;
}

export interface OrderBoard {
  counts: Record<OrderStatus, number>;
  orders: OrderBoardItem[];
}

export interface OrderVariantHit {
  variantId: string;
  sku: string;
  barcode: string;
  productName: string;
  color: string;
  size: string;
  unitPrice: number;
  availability: LocationAvailability[];
}
