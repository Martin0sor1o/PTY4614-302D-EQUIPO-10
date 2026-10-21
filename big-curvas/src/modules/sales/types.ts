import type { PaymentMethodCode } from "./pricing";

export interface SaleLineView {
  variantId: string;
  sku: string;
  productName: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  discountBps: number;
  discount: number;
  lineTotal: number;
}

export interface SalePaymentView {
  method: PaymentMethodCode | "VALE";
  /** Cobrado por este medio (en efectivo: total + redondeo, neto de vuelto). */
  amount: number;
  reference: string | null;
  cashReceived: number | null;
  /** Solo efectivo: cashReceived − amount. */
  change: number | null;
}

export interface SaleView {
  id: string;
  number: string;
  status: "COMPLETADA" | "ANULADA";
  createdAt: Date;
  location: { id: string; name: string; address: string | null };
  sellerName: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  roundingAdjustment: number;
  lines: SaleLineView[];
  payments: SalePaymentView[];
  /** Solo si la venta está ANULADA. */
  voided: { at: Date; reason: string | null; byName: string | null; approved: boolean } | null;
}

export interface CashSessionView {
  id: string;
  locationId: string;
  openedAt: Date;
  openedByName: string;
  openingCash: number;
  status: "ABIERTA" | "CERRADA";
  closedAt: Date | null;
  closedByName: string | null;
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
  notes: string | null;
  salesCount: number;
}

export interface CashClosingTotals {
  salesCount: number;
  byMethod: Record<PaymentMethodCode, number>;
  cashCollected: number;
  /** Efectivo devuelto en esta caja por ventas de OTRA caja anuladas hoy (el efectivo sale de la caja abierta). */
  cashRefunded: number;
  expectedCash: number;
}

export interface PosItemStock {
  onHand: number;
  reserved: number;
  available: number;
}

export interface PosItem {
  variantId: string;
  sku: string;
  barcode: string;
  productName: string;
  color: string;
  size: string;
  unitPrice: number;
  here: PosItemStock;
  /** Pedidos online que tienen unidades reservadas de esta prenda en ESTA tienda (RF-POS-03: el aviso nombra el pedido). */
  reservedFor: { orderNumber: string; qty: number }[];
  /** Otras ubicaciones con unidades físicas (solo consulta). */
  others: { locationId: string; name: string; onHand: number; reserved: number; available: number }[];
}

export interface DaySales {
  from: Date;
  sales: (SaleView & { paymentSummary: string })[];
  totalsByMethod: Record<PaymentMethodCode, number>;
  totalCollected: number;
  count: number;
}
