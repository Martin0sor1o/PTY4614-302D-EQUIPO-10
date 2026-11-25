"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logout, setActiveLocation } from "@/modules/auth";

const locationSchema = z.object({ locationId: z.string().min(1) });

/** Cierra la sesión: la revoca en la BD (el token deja de servir) y borra las cookies. Sirve en modo real y en demo. */
export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}

/** Solo ADMIN (se valida en el módulo auth): elige la ubicación en la que opera. */
export async function setActiveLocationAction(formData: FormData): Promise<void> {
  const { locationId } = locationSchema.parse({ locationId: formData.get("locationId") });
  await setActiveLocation(locationId);
  revalidatePath("/", "layout");
}
