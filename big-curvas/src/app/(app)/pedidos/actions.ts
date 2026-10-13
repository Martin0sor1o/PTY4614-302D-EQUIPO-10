"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError, isAppError, userMessage } from "@/lib/errors";
import { requireAccess } from "@/modules/auth";
import { searchCustomers, type CustomerSummary } from "@/modules/customers";
import {
  cancelOrder,
  confirmPayment,
  dispatchOrder,
  fillShortage,
  getOrderDetail,
  getVariantAvailability,
  markDelivered,
  prepareOrder,
  registerOrder,
  searchOrderVariants,
  updateOrder,
  type LocationAvailability,
  type OrderVariantHit,
} from "@/modules/orders";

// Adaptadores de los pedidos online: validan con Zod, toman usuario y ubicación DE LA SESIÓN (nunca del navegador)
// y delegan en OrdersService, que vuelve a validar rol y ubicación (regla 10). Los errores vuelven como datos.

export type ActionFailure = { ok: false; message: string; code?: string };
export type ActionResult<T = object> = ({ ok: true } & T) | ActionFailure;

function failure(error: unknown): ActionFailure {
  return { ok: false, message: userMessage(error), code: isAppError(error) ? error.code : undefined };
}
const invalid = (error: z.ZodError): ActionFailure => ({ ok: false, message: error.issues[0]?.message ?? "Datos inválidos." });

const idSchema = z.string().trim().min(1).max(64);
const keySchema = z.string().trim().min(8).max(200);

function refresh(orderId?: string) {
  revalidatePath("/pedidos");
  revalidatePath("/stock");
  if (orderId) {
    revalidatePath(`/pedidos/${orderId}`);
  }
}

/** Preparar y despachar los hace quien opera la bodega: Belén debe tener "Operando en: Bodega". */
async function requireBodegaOperation(orderId: string) {
  const user = await requireAccess({ roles: ["ADMIN", "BODEGA"] });
  const order = await getOrderDetail({ actor: user, orderId, forPicking: true });
  if (user.role === "ADMIN" && user.activeLocation?.id !== order.fulfillmentLocation.id) {
    throw new AppError("FORBIDDEN", "Para preparar o despachar elige “Operando en: Bodega” en el menú superior.");
  }
  return { user, order };
}

// ───────────────────────── Consultas del formulario ─────────────────────────

export async function searchOrderVariantsAction(query: string): Promise<ActionResult<{ items: OrderVariantHit[] }>> {
  try {
    const user = await requireAccess({ roles: ["ADMIN"] });
    const parsed = z.string().trim().min(1).max(100).safeParse(query);
    if (!parsed.success) return { ok: true, items: [] };
    return { ok: true, items: await searchOrderVariants({ actor: user, query: parsed.data }) };
  } catch (error) {
    return failure(error);
  }
}

export async function searchCustomersAction(query: string): Promise<ActionResult<{ items: CustomerSummary[] }>> {
  try {
    const user = await requireAccess({ roles: ["ADMIN"] });
    const parsed = z.string().trim().min(1).max(100).safeParse(query);
    if (!parsed.success) return { ok: true, items: [] };
    return { ok: true, items: await searchCustomers({ actor: user, query: parsed.data }) };
  } catch (error) {
    return failure(error);
  }
}

export async function getAvailabilityAction(variantIds: string[]): Promise<ActionResult<{ availability: Record<string, LocationAvailability[]> }>> {
  try {
    const user = await requireAccess({ roles: ["ADMIN"] });
    return { ok: true, availability: await getVariantAvailability({ actor: user, variantIds }) };
  } catch (error) {
    return failure(error);
  }
}

// ───────────────────────── Registrar / editar ─────────────────────────

const orderBodySchema = z
  .object({
    channel: z.enum(["INSTAGRAM", "WHATSAPP"]),
    customerId: idSchema.optional(),
    newCustomer: z
      .object({
        name: z.string().max(120),
        instagramHandle: z.string().max(60).optional(),
        phone: z.string().max(30).optional(),
        address: z.string().max(200).optional(),
        commune: z.string().max(80).optional(),
      })
      .optional(),
    lines: z
      .array(
        z.object({
          variantId: idSchema,
          qty: z.number().int().positive().max(1_000),
          discountBps: z.number().int().min(0).max(10_000),
        }),
      )
      .min(1, "Agrega al menos una prenda al pedido.")
      .max(100),
    shippingCost: z.number().int().min(0).max(10_000_000),
    shippingAddress: z.string().max(300),
    notes: z.string().max(500).optional(),
  })
  .refine((d) => (d.customerId !== undefined) !== (d.newCustomer !== undefined), "Elige una clienta o ingresa los datos de una nueva.");

export async function saveOrderAction(payload: {
  orderId?: string;
  body: unknown;
  idempotencyKey: string;
}): Promise<ActionResult<{ orderId: string }>> {
  const parsed = z.object({ orderId: idSchema.optional(), body: orderBodySchema, idempotencyKey: keySchema }).safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const user = await requireAccess({ roles: ["ADMIN"] });
    const { orderId, body, idempotencyKey } = parsed.data;
    const customer = body.customerId ? { customerId: body.customerId } : { newCustomer: body.newCustomer! };
    const common = {
      actor: user,
      channel: body.channel,
      lines: body.lines,
      shippingCost: body.shippingCost,
      shippingAddress: body.shippingAddress,
      notes: body.notes || undefined,
    };
    if (orderId) {
      const order = await updateOrder({ ...common, ...customer, orderId });
      refresh(order.id);
      return { ok: true, orderId: order.id };
    }
    const { result } = await registerOrder({ ...common, ...customer, idempotencyKey });
    refresh(result.id);
    return { ok: true, orderId: result.id };
  } catch (error) {
    return failure(error);
  }
}

// ───────────────────────── Transiciones ─────────────────────────

const lineSourcesSchema = z.array(z.object({ lineId: idSchema, locationId: idSchema })).max(100).default([]);

export async function confirmPaymentAction(payload: {
  orderId: string;
  method: string;
  reference?: string;
  /** Líneas que Belén aparta en una tienda (solo si la bodega no alcanza para la línea completa). */
  lineSources?: { lineId: string; locationId: string }[];
  idempotencyKey: string;
}): Promise<ActionResult<{ saleNumber: string | null; waitingTransfer: boolean }>> {
  const parsed = z
    .object({
      orderId: idSchema,
      method: z.enum(["TRANSFERENCIA", "DEBITO", "CREDITO", "EFECTIVO"]),
      reference: z.string().trim().max(60).optional(),
      lineSources: lineSourcesSchema,
      idempotencyKey: keySchema,
    })
    .safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const user = await requireAccess({ roles: ["ADMIN"] });
    const { orderId, method, reference, lineSources, idempotencyKey } = parsed.data;
    const { result } = await confirmPayment({ actor: user, orderId, payment: { method, reference: reference || undefined }, lineSources, idempotencyKey });
    refresh(orderId);
    return { ok: true, saleNumber: result.sale?.number ?? null, waitingTransfer: result.status === "ESPERANDO_TRASPASO" };
  } catch (error) {
    return failure(error);
  }
}

export async function fillShortageAction(payload: {
  orderId: string;
  lineSources?: { lineId: string; locationId: string }[];
  idempotencyKey: string;
}): Promise<ActionResult<{ status: string }>> {
  const parsed = z.object({ orderId: idSchema, lineSources: lineSourcesSchema, idempotencyKey: keySchema }).safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const user = await requireAccess({ roles: ["ADMIN"] });
    const { result } = await fillShortage({ actor: user, ...parsed.data });
    refresh(parsed.data.orderId);
    return { ok: true, status: result.status };
  } catch (error) {
    return failure(error);
  }
}

export async function prepareOrderAction(payload: { orderId: string; scanned: unknown; idempotencyKey: string }): Promise<ActionResult> {
  const parsed = z
    .object({
      orderId: idSchema,
      scanned: z.array(z.object({ variantId: idSchema, qty: z.number().int().min(0).max(1_000) })).max(100),
      idempotencyKey: keySchema,
    })
    .safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { user } = await requireBodegaOperation(parsed.data.orderId);
    await prepareOrder({ actor: user, ...parsed.data });
    refresh(parsed.data.orderId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function dispatchOrderAction(payload: {
  orderId: string;
  courier: string;
  trackingNumber: string;
  idempotencyKey: string;
}): Promise<ActionResult> {
  const parsed = z
    .object({ orderId: idSchema, courier: z.string().trim().max(60), trackingNumber: z.string().trim().max(60), idempotencyKey: keySchema })
    .safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { user } = await requireBodegaOperation(parsed.data.orderId);
    await dispatchOrder({ actor: user, ...parsed.data });
    refresh(parsed.data.orderId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function markDeliveredAction(payload: { orderId: string; idempotencyKey: string }): Promise<ActionResult> {
  const parsed = z.object({ orderId: idSchema, idempotencyKey: keySchema }).safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const user = await requireAccess({ roles: ["ADMIN", "BODEGA"] });
    await markDelivered({ actor: user, ...parsed.data });
    refresh(parsed.data.orderId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelOrderAction(payload: { orderId: string; reason: string; idempotencyKey: string }): Promise<ActionResult> {
  const parsed = z.object({ orderId: idSchema, reason: z.string().trim().max(200), idempotencyKey: keySchema }).safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const user = await requireAccess({ roles: ["ADMIN"] });
    await cancelOrder({ actor: user, ...parsed.data });
    refresh(parsed.data.orderId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
