"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { toFailure, type FormFailure } from "@/lib/form-action";
import { linkThisDevice } from "@/modules/auth";

const schema = z.object({ code: z.string().trim().min(1).max(20) });

/** Canjea el código de vinculación en este equipo. Éxito = redirección al login de la caja. */
export async function linkDeviceAction(input: unknown): Promise<FormFailure> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Escribe el código de vinculación." };
  try {
    await linkThisDevice(parsed.data);
  } catch (error) {
    return toFailure(error);
  }
  redirect("/login?vinculado=1");
}
