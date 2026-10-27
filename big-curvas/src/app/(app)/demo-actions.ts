"use server";

import { redirect } from "next/navigation";
import { isAppError, userMessage } from "@/lib/errors";
import { demoLogout, requireAccess } from "@/modules/auth";
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
    if (!isAppError(error)) console.error("[demo] Falló el reinicio de datos:", error);
    return { ok: false, message: userMessage(error) };
  }
  // El seed regenera los ids de usuario: la sesión actual ya no vale. Se vuelve a "Entrar como…".
  await demoLogout();
  redirect("/login?reiniciado=1");
}
