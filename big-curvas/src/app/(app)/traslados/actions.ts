"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAppError, userMessage } from "@/lib/errors";
import { requireAccess } from "@/modules/auth";
import {
  cancelTransferCommand,
  createTransferCommand,
  getTransferDetail,
  receiveTransferCommand,
  resolveTransferDifferenceCommand,
  searchTransferVariants,
  sendTransferCommand,
  updateTransferDraftCommand,
  type TransferVariantHit,
} from "@/modules/inventory";
import { listLocations } from "@/modules/locations";

// Adaptadores de los traslados: validan con Zod, toman la ubicación DESDE LA SESIÓN (nunca del navegador) y
// delegan en InventoryService, que vuelve a validar rol y ubicación (regla 10). Los errores vuelven como datos.

export type ActionFailure = { ok: false; message: string; code?: string };
export type ActionResult<T = object> = ({ ok: true } & T) | ActionFailure;

const ALL_ROLES = ["ADMIN", "VENDEDORA", "BODEGA"] as const;

function failure(error: unknown): ActionFailure {
  return { ok: false, message: userMessage(error), code: isAppError(error) ? error.code : undefined };
}

const idSchema = z.string().trim().min(1).max(64);
const keySchema = z.string().trim().min(8).max(200);
const linesSchema = z
  .array(z.object({ variantId: idSchema, qty: z.number().int().positive().max(10_000) }))
  .min(1, "Agrega al menos una prenda.")
  .max(300);

function refresh(transferId?: string) {
  revalidatePath("/traslados");
  revalidatePath("/stock");
  if (transferId) revalidatePath(`/traslados/${transferId}`);
}

const invalid = (error: z.ZodError): ActionFailure => ({ ok: false, message: error.issues[0]?.message ?? "Datos inválidos." });

export async function searchVariantsAction(query: string): Promise<ActionResult<{ items: TransferVariantHit[] }>> {
  try {
    const user = await requireAccess({ roles: ALL_ROLES });
    const from = user.activeLocation;
    if (!from) return { ok: false, message: "Elige una ubicación en “Operando en”." };
    const parsed = z.string().trim().min(1).max(100).safeParse(query);
    if (!parsed.success) return { ok: true, items: [] };
    return { ok: true, items: await searchTransferVariants({ query: parsed.data, fromLocationId: from.id }) };
  } catch (error) {
    return failure(error);
  }
}

/** Crea el borrador desde la ubicación activa hacia la otra ubicación. */
export async function createDraftAction(payload: { lines: unknown; idempotencyKey: string }): Promise<ActionResult<{ transferId: string }>> {
  const parsed = z.object({ lines: linesSchema, idempotencyKey: keySchema }).safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const user = await requireAccess({ roles: ALL_ROLES });
    const from = user.activeLocation;
    if (!from) return { ok: false, message: "Elige una ubicación en “Operando en” para crear el traslado." };
    await requireAccess({ roles: ALL_ROLES, locationId: from.id });
    const others = (await listLocations()).filter((l) => l.id !== from.id);
    if (others.length !== 1) return { ok: false, message: "No se pudo determinar el destino: debe haber exactamente otra ubicación." };
    const { result } = await createTransferCommand({
      actor: user,
      fromLocationId: from.id,
      toLocationId: others[0].id,
      reason: "REPOSICION",
      lines: parsed.data.lines,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    refresh();
    return { ok: true, transferId: result.id };
  } catch (error) {
    return failure(error);
  }
}

export async function updateDraftAction(payload: { transferId: string; lines: unknown }): Promise<ActionResult<{ transferId: string }>> {
  const parsed = z.object({ transferId: idSchema, lines: linesSchema }).safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const user = await requireAccess({ roles: ALL_ROLES });
    const transfer = await getTransferDetail(parsed.data.transferId);
    await requireAccess({ roles: ALL_ROLES, locationId: transfer.fromLocation.id });
    await updateTransferDraftCommand({ actor: user, transferId: parsed.data.transferId, lines: parsed.data.lines });
    refresh(parsed.data.transferId);
    return { ok: true, transferId: parsed.data.transferId };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelDraftAction(payload: { transferId: string }): Promise<ActionResult> {
  const parsed = z.object({ transferId: idSchema }).safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const user = await requireAccess({ roles: ALL_ROLES });
    const transfer = await getTransferDetail(parsed.data.transferId);
    await requireAccess({ roles: ALL_ROLES, locationId: transfer.fromLocation.id });
    await cancelTransferCommand({ actor: user, transferId: parsed.data.transferId });
    refresh(parsed.data.transferId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function sendTransferAction(payload: { transferId: string; idempotencyKey: string }): Promise<ActionResult> {
  const parsed = z.object({ transferId: idSchema, idempotencyKey: keySchema }).safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const user = await requireAccess({ roles: ALL_ROLES });
    const transfer = await getTransferDetail(parsed.data.transferId);
    await requireAccess({ roles: ALL_ROLES, locationId: transfer.fromLocation.id });
    await sendTransferCommand({ actor: user, ...parsed.data });
    refresh(parsed.data.transferId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function receiveTransferAction(payload: {
  transferId: string;
  lines: unknown;
  idempotencyKey: string;
}): Promise<ActionResult<{ withDifferences: boolean }>> {
  const parsed = z
    .object({
      transferId: idSchema,
      // En la recepción también se informan las prendas con 0 escaneadas (faltan todas).
      lines: z.array(z.object({ variantId: idSchema, qty: z.number().int().min(0).max(10_000) })).min(1).max(300),
      idempotencyKey: keySchema,
    })
    .safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const user = await requireAccess({ roles: ALL_ROLES });
    const transfer = await getTransferDetail(parsed.data.transferId);
    await requireAccess({ roles: ALL_ROLES, locationId: transfer.toLocation.id });
    const { result } = await receiveTransferCommand({ actor: user, ...parsed.data });
    refresh(parsed.data.transferId);
    return { ok: true, withDifferences: result.transfer.status === "RECIBIDO_CON_DIFERENCIAS" };
  } catch (error) {
    return failure(error);
  }
}

export async function resolveDifferencesAction(payload: {
  transferId: string;
  resolutions: unknown;
  notes?: string;
  idempotencyKey: string;
}): Promise<ActionResult<{ closed: boolean; reshipTransferId: string | null; reshipNumber: string | null }>> {
  const parsed = z
    .object({
      transferId: idSchema,
      resolutions: z
        .array(z.object({ lineId: idSchema, resolution: z.enum(["MERMA", "REENVIO", "ERROR_ENVIO"]) }))
        .min(1, "Elige la resolución de al menos una prenda."),
      notes: z.string().trim().max(500).optional(),
      idempotencyKey: keySchema,
    })
    .safeParse(payload);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const user = await requireAccess({ roles: ["ADMIN"] });
    const { result } = await resolveTransferDifferenceCommand({ actor: user, ...parsed.data, notes: parsed.data.notes || undefined });
    refresh(parsed.data.transferId);
    return {
      ok: true,
      closed: result.transfer.status === "CERRADO",
      reshipTransferId: result.reshipTransfer?.id ?? null,
      reshipNumber: result.reshipTransfer?.number ?? null,
    };
  } catch (error) {
    return failure(error);
  }
}
