import { randomUUID } from "node:crypto";
import type { Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { formatCLP } from "@/lib/money";
import { PaymentMethod, SaleChannel } from "@/generated/prisma/client";
import { nextDocumentNumber } from "@/modules/numbering";
import { priceOrder, quotePayment, type PaymentMethodCode } from "./pricing";

export interface CreateOnlineSaleInput {
  actor: Actor;
  /** Ubicación contable de la venta online: BODEGA (despacha online). */
  locationId: string;
  channel: "INSTAGRAM" | "WHATSAPP" | "WEB";
  onlineOrderId: string;
  customerId: string;
  /** Precio unitario y descuento congelados al registrar el pedido (la clienta ya los aceptó). */
  lines: { variantId: string; qty: number; unitPrice: number; discountBps: number }[];
  shippingCost: number;
  payment: { method: PaymentMethodCode; reference?: string };
  idempotencyKey: string;
}

export interface OnlineSaleResult {
  saleId: string;
  number: string;
  total: number;
  /** Lo cobrado por el medio de pago: total (+ redondeo si es efectivo). */
  amountPaid: number;
}

/**
 * Venta de un pedido online (RN-13: se contabiliza al confirmar el pago). La llama `orders` dentro de SU transacción.
 * NO toca el stock: el stock baja al preparar el pedido en bodega (RN-08, `consumeReservations`).
 * El envío va dentro del total, así que SUM(payments) = total + rounding_adjustment se mantiene.
 */
export async function createOnlineSale(tx: Tx, input: CreateOnlineSaleInput): Promise<OnlineSaleResult> {
  assertAccess(input.actor, { roles: ["ADMIN"], locationId: input.locationId });
  const location = await tx.location.findFirst({
    where: { id: input.locationId, active: true },
    select: { id: true, name: true, fulfillsOnline: true, salePrefix: true },
  });
  if (!location) throw new AppError("NOT_FOUND", "La ubicación no existe o está inactiva.", { locationId: input.locationId });
  if (!location.fulfillsOnline) throw new AppError("VALIDATION", `${location.name} no despacha pedidos online.`);

  const priced = priceOrder(
    input.lines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.qty, discountBps: l.discountBps })),
    input.shippingCost,
  );
  if (priced.total <= 0) throw new AppError("VALIDATION", "El total del pedido debe ser mayor a $0.");
  const quote = quotePayment(priced.total, input.payment.method);
  if (quote.amount <= 0) {
    throw new AppError("VALIDATION", `El monto a cobrar debe ser mayor a $0 (total ${formatCLP(priced.total)}).`);
  }
  const reference = input.payment.reference?.trim() || null;
  if (input.payment.method !== "EFECTIVO" && !reference) {
    throw new AppError("VALIDATION", "La referencia del pago es obligatoria (N° de transferencia o voucher).");
  }

  const saleId = randomUUID();
  // El correlativo se toma al final de los cálculos: un rollback no deja huecos.
  const number = await nextDocumentNumber(tx, `SALE:${location.salePrefix}`, location.salePrefix);
  await tx.sale.create({
    data: {
      id: saleId,
      number,
      channel: SaleChannel[input.channel],
      locationId: location.id,
      cashSessionId: null,
      sellerId: input.actor.id,
      customerId: input.customerId,
      onlineOrderId: input.onlineOrderId,
      subtotal: priced.subtotal,
      discountTotal: priced.discountTotal,
      shippingCost: priced.shippingCost,
      total: priced.total,
      roundingAdjustment: quote.roundingAdjustment,
      idempotencyKey: input.idempotencyKey,
    },
  });
  await tx.saleLine.createMany({
    data: input.lines.map((l, i) => ({
      saleId,
      variantId: l.variantId,
      quantity: l.qty,
      unitPrice: priced.lines[i].unitPrice,
      manualDiscountBps: l.discountBps,
      manualDiscount: priced.lines[i].discount,
      lineTotal: priced.lines[i].lineTotal,
    })),
  });
  await tx.payment.create({
    data: {
      saleId,
      method: PaymentMethod[input.payment.method],
      amount: quote.amount,
      reference,
      cashReceived: null,
    },
  });
  return { saleId, number, total: priced.total, amountPaid: quote.amount };
}
