"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { toFailure, type FormFailure } from "@/lib/form-action";
import { demoLogin, getDeviceLogin, signInWithPassword, signInWithPin, type OperatorOption } from "@/modules/auth";

const demoSchema = z.object({ userId: z.string().min(1) });

// DEMO: "Entrar como…" sin contraseña. Solo funciona con DEMO_MODE=true (se valida en demoLogin).
export async function demoLoginAction(formData: FormData): Promise<void> {
  const { userId } = demoSchema.parse({ userId: formData.get("userId") });
  await demoLogin(userId);
  redirect("/");
}

const passwordSchema = z.object({ email: z.string().max(254), password: z.string().max(128) });

/** Email + contraseña (administradora). Éxito = redirección; el error vuelve como dato, siempre con un mensaje genérico. */
export async function passwordLoginAction(input: unknown): Promise<FormFailure> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Email o contraseña incorrectos." };
  let mustChangePassword: boolean;
  try {
    ({ mustChangePassword } = await signInWithPassword(parsed.data));
  } catch (error) {
    return toFailure(error);
  }
  redirect(mustChangePassword ? "/cuenta/contrasena" : "/");
}

const pinSchema = z.object({ userId: z.string().min(1).max(64), pin: z.string().max(12) });

/** Vendedora: elige su nombre y escribe su PIN en el equipo vinculado a la tienda. */
export async function pinLoginAction(input: unknown): Promise<FormFailure> {
  const parsed = pinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "PIN incorrecto." };
  try {
    await signInWithPin(parsed.data);
  } catch (error) {
    return toFailure(error);
  }
  redirect("/pos");
}

/**
 * Reingreso de la vendedora SIN salir de la pantalla (la sesión de caja venció con una venta a medias): crea la sesión y
 * devuelve ok, sin redirigir, para que el carrito siga donde está.
 */
export async function pinReloginAction(input: unknown): Promise<{ ok: true } | FormFailure> {
  const parsed = pinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "PIN incorrecto." };
  try {
    await signInWithPin(parsed.data);
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/** Vendedoras que pueden reingresar en ESTE equipo (la cookie del dispositivo identifica la tienda). No requiere sesión. */
export async function listReloginOperatorsAction(): Promise<{ ok: true; locationName: string; operators: OperatorOption[] } | FormFailure> {
  try {
    const device = await getDeviceLogin();
    if (!device) return { ok: false, message: "Este equipo no está vinculado a una tienda." };
    return { ok: true, locationName: device.locationName, operators: device.operators };
  } catch (error) {
    return toFailure(error);
  }
}
