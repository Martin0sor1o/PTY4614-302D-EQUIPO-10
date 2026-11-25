import type { MoneyRefundMethod, ReturnApprovalType } from "./pricing";

export type ReturnCondition = "VENDIBLE" | "DANADA";
export type ReturnType = "CAMBIO" | "DEVOLUCION";
export type RefundMethod = MoneyRefundMethod | "VALE" | "NINGUNO";

export interface ReturnableLine {
  saleLineId: string;
  variantId: string;
  sku: string;
  productName: string;
  color: string;
  size: string;
  soldQty: number;
  returnedQty: number;
  /** vendidas − ya devueltas */
  returnableQty: number;
  /** Total pagado por la línea (con su descuento). */
  lineTotal: number;
}

/** Una venta lista para devolver (RF-DEV-01): con lo que se puede devolver de cada línea y las reglas que aplican. */
export interface ReturnableSale {
  id: string;
  number: string;
  channel: string;
  createdAt: Date;
  locationId: string;
  locationName: string;
  /** Pedido online de la venta (si es online). */
  orderNumber: string | null;
  /** Desde cuándo corre el plazo: la venta (POS) o la entrega/despacho (online). */
  referenceDate: Date;
  daysSince: number;
  windowDays: number;
  outOfWindow: boolean;
  paymentMethods: string[];
  /** S-07: si se pagó (en parte) con vale, solo se devuelve en vale o cambio. */
  paidWithVoucher: boolean;
  suggestedRefundMethod: MoneyRefundMethod;
  lines: ReturnableLine[];
}

export interface ReturnSaleHit {
  id: string;
  number: string;
  channel: string;
  createdAt: Date;
  total: number;
  locationName: string;
  returnableUnits: number;
}

export interface QuotedLine {
  saleLineId: string;
  variantId: string;
  sku: string;
  productName: string;
  color: string;
  size: string;
  qty: number;
  condition: ReturnCondition;
  amount: number;
}

export interface ReturnQuote {
  saleId: string;
  saleNumber: string;
  daysSinceSale: number;
  windowDays: number;
  outOfWindow: boolean;
  lines: QuotedLine[];
  valueReturned: number;
  resolution: "VALE" | "DINERO" | "CAMBIO";
  /** Reembolso en dinero (solo DINERO). En efectivo ya va redondeado a $10. */
  refund: { method: MoneyRefundMethod; amount: number; roundingAdjustment: number } | null;
  /** Vale que se emite: devolución a vale (el valor completo) o saldo a favor de un cambio. 0 si no hay. */
  voucherAmount: number;
  /** Solo CAMBIO. */
  exchange: { newTotal: number; voucherUsed: number; toPay: number; leftover: number; newLines: { variantId: string; sku: string; label: string; qty: number; unitPrice: number; lineTotal: number }[] } | null;
  voucherCap: number;
  /** Una VENDEDORA necesita la aprobación de Belén (`required`); `type` y `reasons` también se informan al ADMIN. */
  approval: { required: boolean; type: ReturnApprovalType | null; reasons: string[] };
  /** Huella de lo que se aprueba (venta + prendas + destino + prendas nuevas). */
  binding: string;
  /** Caja abierta en la tienda (importa si el reembolso es en efectivo o si es un cambio). */
  cashOpen: boolean;
  /** Avisos que no bloquean la cotización pero sí la ejecución (p. ej. sin caja abierta). */
  warnings: string[];
}

export interface ReturnView {
  id: string;
  number: string;
  type: ReturnType;
  reason: string;
  reasonNote: string | null;
  createdAt: Date;
  location: { id: string; name: string };
  sale: { id: string; number: string };
  userName: string;
  valueReturned: number;
  refundMethod: RefundMethod;
  refundAmount: number;
  roundingAdjustment: number;
  refundReference: string | null;
  approvalId: string | null;
  lines: { saleLineId: string; variantId: string; sku: string; productName: string; color: string; size: string; qty: number; amount: number; condition: ReturnCondition }[];
  /** Vale emitido (devolución a vale o saldo a favor de un cambio). */
  voucher: { id: string; code: string; initialAmount: number; balance: number; expiresAt: Date } | null;
  /** Venta nueva del cambio. */
  newSale: { id: string; number: string; total: number } | null;
}
