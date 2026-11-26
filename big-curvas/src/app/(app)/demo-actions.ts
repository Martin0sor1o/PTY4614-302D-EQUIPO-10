"use server";

import { redirect } from "next/navigation";
import { userMessage } from "@/lib/errors";
import { logout, requireAccess } from "@/modules/auth";
import { resetDemoData } from "@/modules/demo";

export type ResetDemoResult = { ok: false; message: string };

// DEMO: "Reiniciar datos de demo". Solo ADMIN y solo con DEMO_MODE (ambos se validan en el servidor, en resetDemoData).
export async function resetDemoDataAction(): Promise<ResetDemoResult> {
  try {
    const user = await requireAccess({ roles: ["ADMIN"] });
    const started = Date.now();
    await resetDemoData({ actor: user });
    console.log(`[demo] Datos de demo reiniciados en ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  } catch (error) {
    return { ok: false, message: userMessage(error) };
  }
  // El seed regenera los ids de usuario: la sesión actual ya no vale. Se vuelve a "Entrar como…".
  await logout();
  redirect("/login?reiniciado=1");
}
