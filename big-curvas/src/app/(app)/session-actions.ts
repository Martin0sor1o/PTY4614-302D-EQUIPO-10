"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { demoLogout, setActiveLocation } from "@/modules/auth";

const locationSchema = z.object({ locationId: z.string().min(1) });

export async function logoutAction(): Promise<void> {
  await demoLogout(); // DEMO
  redirect("/login");
}

/** Solo ADMIN (se valida en el módulo auth): elige la ubicación en la que opera. */
export async function setActiveLocationAction(formData: FormData): Promise<void> {
  const { locationId } = locationSchema.parse({ locationId: formData.get("locationId") });
  await setActiveLocation(locationId); // DEMO
  revalidatePath("/", "layout");
}
