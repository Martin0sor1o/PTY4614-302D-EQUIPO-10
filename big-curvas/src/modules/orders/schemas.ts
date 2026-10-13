import { z } from "zod";
import { newCustomerSchema } from "@/modules/customers";

// Validación de entrada de OrdersService. El cliente NO envía montos: el servidor calcula todo con sales/pricing.

const id = z.string().trim().min(1, "Falta el identificador");
const idempotencyKey = z.string().trim().min(8, "idempotencyKey inválida").max(200);

const orderLine = z.object({
  variantId: id,
  qty: z.number().int("La cantidad debe ser entera").positive("La cantidad debe ser mayor a 0").max(1_000),
  /** Descuento de la línea en puntos básicos (1000 = 10 %). Solo Belén da descuentos. */
  discountBps: z.number().int("El descuento debe ser entero (puntos básicos)").min(0, "El descuento no puede ser negativo").max(10_000),
});

const orderBody = {
  channel: z.enum(["INSTAGRAM", "WHATSAPP"]),
  /** Clienta existente o ficha nueva (se crea en la misma transacción del pedido). */
  customerId: id.optional(),
  newCustomer: newCustomerSchema.optional(),
  lines: z.array(orderLine).min(1, "El pedido no tiene prendas").max(100, "Demasiadas líneas"),
  /** Envío cobrado a la clienta, ingresado a mano (P-11 pendiente). */
  shippingCost: z
    .number()
    .int("El envío debe ser un monto entero en pesos")
    .min(0, "El envío no puede ser negativo")
    .max(10_000_000, "Envío demasiado alto"),
  shippingAddress: z.string().trim().min(5, "La dirección de despacho es obligatoria").max(300),
  notes: z.string().trim().max(500).optional(),
};

function exactlyOneCustomer(d: { customerId?: string; newCustomer?: unknown }): boolean {
  return (d.customerId !== undefined) !== (d.newCustomer !== undefined);
}
const customerMessage = "Elige una clienta o ingresa los datos de una nueva.";

export const registerOrderSchema = z
  .object({ ...orderBody, idempotencyKey })
  .refine(exactlyOneCustomer, { message: customerMessage, path: ["customerId"] });

export const updateOrderSchema = z
  .object({ ...orderBody, orderId: id })
  .refine(exactlyOneCustomer, { message: customerMessage, path: ["customerId"] });

export const paymentSchema = z.object({
  method: z.enum(["TRANSFERENCIA", "DEBITO", "CREDITO", "EFECTIVO"]),
  /** N° de transferencia o voucher. Obligatorio salvo en efectivo. */
  reference: z.string().trim().max(60).optional(),
});

/** Líneas que Belén aparta en una tienda (solo si la bodega no tiene para la línea completa). El resto va a bodega. */
const lineSources = z.array(z.object({ lineId: id, locationId: id })).max(100).default([]);

export const confirmPaymentSchema = z
  .object({ orderId: id, payment: paymentSchema, lineSources, idempotencyKey })
  .superRefine((d, ctx) => {
    if (d.payment.method !== "EFECTIVO" && !d.payment.reference) {
      ctx.addIssue({ code: "custom", message: "La referencia del pago es obligatoria (N° de transferencia o voucher).", path: ["payment", "reference"] });
    }
  });

export const fillShortageSchema = z.object({ orderId: id, lineSources, idempotencyKey });

export const prepareOrderSchema = z.object({
  orderId: id,
  /** Lo escaneado en bodega: debe coincidir exactamente con las prendas del pedido. */
  scanned: z.array(z.object({ variantId: id, qty: z.number().int().min(0).max(1_000) })),
  idempotencyKey,
});

export const dispatchOrderSchema = z.object({
  orderId: id,
  courier: z.string().trim().min(1, "Elige un courier").max(60),
  trackingNumber: z.string().trim().min(3, "El N° de seguimiento es obligatorio").max(60),
  idempotencyKey,
});

export const deliverOrderSchema = z.object({ orderId: id, idempotencyKey });

export const cancelOrderSchema = z.object({
  orderId: id,
  reason: z.string().trim().min(3, "El motivo de la cancelación es obligatorio").max(200),
  idempotencyKey,
});
