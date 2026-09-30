"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SessionLocation } from "@/lib/access";
import { isAppError, userMessage } from "@/lib/errors";
import { parseCLP } from "@/lib/money";
import { requireAccess } from "@/modules/auth";
import {
  closeCashSession,
  createSale,
  getPosItemsByIds,
  openCashSession,
  saleRequestSchema,
  searchPosItems,
  type PosItem,
} from "@/modules/sales";

// Adaptadores del POS: validan con Zod, resuelven la tienda DESDE LA SESIÓN (nunca desde el navegador) y
// delegan en SalesService, que vuelve a validar rol y ubicación. Los errores de negocio vuelven como datos.

export type ActionFailure = {
  ok: false;
  message: string;
  code?: string;
  variantId?: string;
  needsNotes?: boolean;
};

function failure(error: unknown): ActionFailure {
  const details = isAppError(error) ? error.details : undefined;
  return {
    ok: false,
    message: userMessage(error),
    code: isAppError(error) ? error.code : undefined,
    variantId: typeof details?.variantId === "string" ? details.variantId : undefined,
    needsNotes: details?.needsNotes === true,
  };
}

/** Usuario con rol POS y su tienda de trabajo (VENDEDORA: la suya; ADMIN: la elegida en "Operando en"). */
async function posContext() {
  const user = await requireAccess({ roles: ["ADMIN", "VENDEDORA"] });
  const location: SessionLocation | null = user.activeLocation;
  if (!location) {
    return { user, location: null } as const;
  }
  await requireAccess({ roles: ["ADMIN", "VENDEDORA"], locationId: location.id });
  return { user, location } as const;
}

const NO_LOCATION: ActionFailure = { ok: false, message: "Elige una tienda en “Operando en” para usar el POS." };

const querySchema = z.string().trim().min(1).max(100);

export async function searchItemsAction(query: string): Promise<{ ok: true; items: PosItem[] } | ActionFailure> {
  try {
    const { user, location } = await posContext();
    if (!location) return NO_LOCATION;
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) return { ok: true, items: [] };
    return { ok: true, items: await searchPosItems({ actor: user, locationId: location.id, query: parsed.data }) };
  } catch (error) {
    return failure(error);
  }
}

export async function refreshItemsAction(variantIds: string[]): Promise<{ ok: true; items: PosItem[] } | ActionFailure> {
  try {
    const { user, location } = await posContext();
    if (!location) return NO_LOCATION;
    const ids = z.array(z.string().min(1).max(64)).max(100).parse(variantIds);
    return { ok: true, items: await getPosItemsByIds({ actor: user, locationId: location.id, variantIds: ids }) };
  } catch (error) {
    return failure(error);
  }
}

export async function createSaleAction(payload: unknown): Promise<{ ok: true; saleId: string; number: string } | ActionFailure> {
  try {
    const { user, location } = await posContext();
    if (!location) return NO_LOCATION;
    const parsed = saleRequestSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos de la venta inválidos." };
    const { result } = await createSale({ actor: user, locationId: location.id, ...parsed.data });
    revalidatePath("/stock");
    revalidatePath("/pos/ventas");
    return { ok: true, saleId: result.id, number: result.number };
  } catch (error) {
    return failure(error);
  }
}

export type FormState = { message?: string; needsNotes?: boolean; values?: { amount?: string; notes?: string } } | undefined;

export async function openCashAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = String(formData.get("openingCash") ?? "");
  const amount = parseCLP(raw);
  if (amount === null || amount < 0) return { message: "Ingresa el monto inicial en pesos (ej. 50000).", values: { amount: raw } };
  try {
    const { user, location } = await posContext();
    if (!location) return { message: NO_LOCATION.message, values: { amount: raw } };
    await openCashSession({ actor: user, locationId: location.id, openingCash: amount });
  } catch (error) {
    return { message: userMessage(error), values: { amount: raw } };
  }
  revalidatePath("/pos", "layout");
  redirect("/pos");
}

export async function closeCashAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = String(formData.get("countedCash") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const values = { amount: raw, notes };
  const counted = parseCLP(raw);
  if (counted === null || counted < 0) return { message: "Ingresa el efectivo contado en pesos (ej. 85000).", values };

  let closedId: string;
  try {
    const { user, location } = await posContext();
    if (!location) return { message: NO_LOCATION.message, values };
    const closed = await closeCashSession({ actor: user, locationId: location.id, countedCash: counted, notes: notes || undefined });
    closedId = closed.id;
  } catch (error) {
    const f = failure(error);
    return { message: f.message, needsNotes: f.needsNotes, values };
  }
  revalidatePath("/pos", "layout");
  redirect(`/pos/caja?cerrada=${closedId}`);
}
