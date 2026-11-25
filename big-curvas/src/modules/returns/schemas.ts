import { z } from "zod";
import { paymentInputSchema } from "@/modules/sales";
import { RETURN_REASONS } from "./rules";

// Validación de entrada de ReturnsService (la usan las Server Actions y los tests).

const id = z.string().trim().min(1, "Falta el identificador");
const idempotencyKey = z.string().trim().min(8, "idempotencyKey inválida").max(200);

export const returnLineSchema = z.object({
  saleLineId: id,
  qty: z.number().int("La cantidad debe ser entera").positive("La cantidad debe ser mayor a 0").max(1_000),
  condition: z.enum(["VENDIBLE", "DANADA"]),
});

export const resolutionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("VALE") }),
  z.object({
    kind: z.literal("DINERO"),
    method: z.enum(["EFECTIVO", "TRANSFERENCIA", "ANULACION_TRANSBANK"]),
    /** N° de transferencia o de anulación: obligatorio si no es efectivo. */
    reference: z.string().trim().max(60).optional(),
  }),
  z.object({
    kind: z.literal("CAMBIO"),
    newLines: z
      .array(z.object({ variantId: id, qty: z.number().int().positive().max(1_000) }))
      .min(1, "Elige la prenda nueva")
      .max(50),
    /** Medio de pago de la diferencia a pagar (si la hay). */
    payment: paymentInputSchema.optional(),
  }),
]);

const lines = z.array(returnLineSchema).min(1, "Elige al menos una prenda a devolver").max(100);
const reason = z.enum(RETURN_REASONS, { message: "Elige el motivo de la devolución" });
const reasonNote = z.string().trim().max(300).optional();

const withNote = <T extends { reason: string; reasonNote?: string }>(v: T) => v.reason !== "OTRO" || (v.reasonNote?.length ?? 0) >= 3;
const noteMessage = { message: "Cuenta brevemente el motivo", path: ["reasonNote"] };

const quoteBase = z.object({ locationId: id, saleId: id, lines, resolution: resolutionSchema });
export const quoteReturnSchema = quoteBase;

const requestBase = quoteBase.extend({ reason, reasonNote, idempotencyKey });
export const requestReturnApprovalSchema = requestBase.refine(withNote, noteMessage);

const createBase = requestBase.extend({ approvalId: id.optional() });
export const createReturnSchema = createBase.refine(withNote, noteMessage);

/** Lo que envía el navegador (sin ubicación: sale de la sesión). */
export const quoteReturnRequestSchema = quoteBase.omit({ locationId: true });
export const requestReturnApprovalRequestSchema = requestBase.omit({ locationId: true }).refine(withNote, noteMessage);
export const createReturnRequestSchema = createBase.omit({ locationId: true }).refine(withNote, noteMessage);

export const searchSalesSchema = z.object({
  locationId: id,
  query: z.string().trim().max(60).default(""),
  limit: z.number().int().min(1).max(30).default(10),
});

export type ReturnLineInput = z.infer<typeof returnLineSchema>;
export type ReturnResolutionInput = z.infer<typeof resolutionSchema>;
