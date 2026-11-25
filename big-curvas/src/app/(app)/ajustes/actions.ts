"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toFailure, type FormFailure } from "@/lib/form-action";
import { createPairingCode, requireAccess, revokeDevice, setSalesPin } from "@/modules/auth";

// Ajustes de la administradora: dispositivos de caja y PIN de las vendedoras. Cada acción exige el rol ADMIN en el
// servidor (requireAccess); el servicio vuelve a validarlo. Ocultar el menú no es seguridad.

const pairingSchema = z.object({ locationId: z.string().min(1).max(64), name: z.string().max(60) });

/** Genera un código de vinculación de un solo uso (10 min). El código se devuelve UNA vez: en la BD solo queda su HMAC. */
export async function createPairingAction(
  input: unknown,
): Promise<{ ok: true; code: string; expiresAt: string; deviceName: string } | FormFailure> {
  const parsed = pairingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revisa los datos ingresados." };
  try {
    const user = await requireAccess({ roles: ["ADMIN"] });
    const created = await createPairingCode({ actor: user, locationId: parsed.data.locationId, name: parsed.data.name });
    revalidatePath("/ajustes/dispositivos");
    return { ok: true, code: created.code, expiresAt: created.expiresAt.toISOString(), deviceName: parsed.data.name.trim() };
  } catch (error) {
    return toFailure(error);
  }
}

export async function revokeDeviceAction(input: unknown): Promise<{ ok: true; sessionsRevoked: number } | FormFailure> {
  const parsed = z.object({ deviceId: z.string().min(1).max(64) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revisa los datos ingresados." };
  try {
    const user = await requireAccess({ roles: ["ADMIN"] });
    const { sessionsRevoked } = await revokeDevice({ actor: user, deviceId: parsed.data.deviceId });
    revalidatePath("/ajustes/dispositivos");
    return { ok: true, sessionsRevoked };
  } catch (error) {
    return toFailure(error);
  }
}

const pinSchema = z.object({ userId: z.string().min(1).max(64), pin: z.string().max(12) });

/** Define o restablece el PIN (6 dígitos) de una vendedora. Desbloquea su PIN y cierra sus sesiones de caja. */
export async function setSalesPinAction(input: unknown): Promise<{ ok: true } | FormFailure> {
  const parsed = pinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revisa los datos ingresados." };
  try {
    const user = await requireAccess({ roles: ["ADMIN"] });
    await setSalesPin({ actor: user, userId: parsed.data.userId, pin: parsed.data.pin });
    revalidatePath("/ajustes/equipo");
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}
