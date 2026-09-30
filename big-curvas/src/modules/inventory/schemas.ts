import { z } from "zod";

// Validación de entrada de InventoryService. Las Server Actions validan lo suyo; el servicio valida igual
// porque también lo llaman sales/orders y los tests.

const MAX_QTY = 10_000;

export const id = z.string().trim().min(1, "Falta el identificador");
export const qty = z.number().int("La cantidad debe ser entera").positive("La cantidad debe ser mayor a 0").max(MAX_QTY);
export const idempotencyKey = z.string().trim().min(8, "idempotencyKey inválida").max(200);

const line = z.object({ variantId: id, qty });
const lines = z.array(line).min(1, "Debe haber al menos una línea");

export const loadInitialStockSchema = z.object({
  locationId: id,
  lines: z.array(z.object({ variantId: id, qty: z.number().int().min(0).max(MAX_QTY) })).min(1),
  idempotencyKey,
});

export const receiveSchema = z.object({
  locationId: id,
  lines,
  goodsReceiptId: id.optional(),
  reason: z.string().trim().max(200).optional(),
  idempotencyKey,
});

export const adjustSchema = z.object({
  locationId: id,
  variantId: id,
  delta: z
    .number()
    .int("El ajuste debe ser entero")
    .refine((d) => d !== 0, "El ajuste no puede ser 0")
    .refine((d) => Math.abs(d) <= MAX_QTY, "Ajuste demasiado grande"),
  reason: z.string().trim().min(3, "El motivo es obligatorio").max(200),
  idempotencyKey,
});

export const sellSchema = z.object({
  locationId: id,
  lines,
  saleId: id,
  idempotencyKey,
});

export const reserveSchema = z.object({
  lines: z.array(z.object({ variantId: id, locationId: id, qty, orderLineId: id.optional() })).min(1),
  expiresAt: z.date().nullable().optional(),
});

export const releaseSchema = z.object({
  reservationIds: z.array(id).min(1),
  reason: z.string().trim().min(3, "El motivo es obligatorio").max(200),
});

export const consumeSchema = z.object({
  reservationIds: z.array(id).min(1),
  onlineOrderId: id.optional(),
  idempotencyKey,
});

export const createTransferSchema = z
  .object({
    fromLocationId: id,
    toLocationId: id,
    reason: z.enum(["REPOSICION", "PEDIDO_ONLINE", "DEVOLUCION_A_BODEGA", "OTRO"]).default("OTRO"),
    onlineOrderId: id.optional(),
    lines: z
      .array(z.object({ variantId: id, qty, orderLineId: id.optional(), reservationId: id.optional() }))
      .min(1, "El traspaso debe tener al menos una prenda"),
    idempotencyKey,
  })
  .refine((t) => t.fromLocationId !== t.toLocationId, "El origen y el destino deben ser distintos");

export const sendTransferSchema = z.object({ transferId: id, idempotencyKey });

export const receiveTransferSchema = z.object({
  transferId: id,
  /** Lo efectivamente escaneado en destino. Las prendas del traspaso que no aparecen cuentan como 0. */
  lines: z.array(z.object({ variantId: id, qty: z.number().int().min(0).max(MAX_QTY) })),
  idempotencyKey,
});
