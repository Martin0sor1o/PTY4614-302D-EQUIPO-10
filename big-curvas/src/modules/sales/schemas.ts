import { z } from "zod";

// Validación de entrada de SalesService (lo llaman las Server Actions y los tests).

const id = z.string().trim().min(1, "Falta el identificador");
const idempotencyKey = z.string().trim().min(8, "idempotencyKey inválida").max(200);
const clp = (label: string) =>
  z.number().int(`${label} debe ser un monto entero en pesos`).min(0, `${label} no puede ser negativo`).max(100_000_000, `${label} demasiado alto`);

export const openCashSchema = z.object({
  locationId: id,
  openingCash: clp("El monto inicial"),
});

export const closeCashSchema = z.object({
  locationId: id,
  countedCash: clp("El efectivo contado"),
  notes: z.string().trim().max(500, "La observación es muy larga").optional(),
});

const saleLine = z.object({
  variantId: id,
  qty: z.number().int("La cantidad debe ser entera").positive("La cantidad debe ser mayor a 0").max(1_000),
  /** Descuento de la línea en puntos básicos (1000 = 10 %). */
  discountBps: z.number().int("El descuento debe ser entero (puntos básicos)").min(0, "El descuento no puede ser negativo").max(10_000),
});

// El cliente NO envía montos de la venta (subtotal, total, descuento en pesos): el servidor los calcula.
// Solo declara el medio de pago y, en efectivo, cuánto entregó la clienta.
export const paymentInputSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("EFECTIVO"), cashReceived: clp("El monto recibido") }),
  z.object({ method: z.literal("DEBITO"), reference: z.string().trim().min(1, "El N° de voucher es obligatorio").max(60) }),
  z.object({ method: z.literal("CREDITO"), reference: z.string().trim().min(1, "El N° de voucher es obligatorio").max(60) }),
  z.object({ method: z.literal("TRANSFERENCIA"), reference: z.string().trim().min(1, "La referencia de la transferencia es obligatoria").max(60) }),
]);

export const createSaleSchema = z.object({
  locationId: id,
  lines: z.array(saleLine).min(1, "El carrito está vacío").max(100, "Demasiadas líneas"),
  payment: paymentInputSchema,
  idempotencyKey,
});

/** Lo que envía el navegador al confirmar una venta (sin ubicación: sale de la sesión). */
export const saleRequestSchema = createSaleSchema.omit({ locationId: true });

export const searchSchema = z.object({
  locationId: id,
  query: z.string().trim().min(1).max(100),
  limit: z.number().int().min(1).max(30).default(12),
});
