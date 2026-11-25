"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { toFailure, type FormFailure } from "@/lib/form-action";
import { changeOwnPassword, requireAccess, setOwnApprovalPin } from "@/modules/auth";

const changeSchema = z.object({ current: z.string().max(128), next: z.string().max(128), confirm: z.string().max(128) });

/** Cambia la contraseña (también el cambio forzado de la contraseña temporal). Éxito = redirección al inicio. */
export async function changePasswordAction(input: unknown): Promise<FormFailure> {
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revisa los datos ingresados." };
  if (parsed.data.next !== parsed.data.confirm) return { ok: false, message: "La nueva contraseña y su confirmación no coinciden." };
  try {
    await changeOwnPassword({ current: parsed.data.current, next: parsed.data.next });
  } catch (error) {
    return toFailure(error);
  }
  redirect("/");
}

const pinSchema = z.object({ password: z.string().max(128), pin: z.string().max(12) });

/** La administradora define su PIN de aprobación presencial (RF-AUT-05), confirmando con su contraseña. */
export async function setApprovalPinAction(input: unknown): Promise<{ ok: true } | FormFailure> {
  const parsed = pinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revisa los datos ingresados." };
  try {
    const user = await requireAccess({ roles: ["ADMIN"] });
    await setOwnApprovalPin({ actor: user, password: parsed.data.password, pin: parsed.data.pin });
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}
