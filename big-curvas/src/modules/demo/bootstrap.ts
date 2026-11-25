import { db } from "@/lib/db";
import { demoHistoryEnabled, isDemoMode } from "@/lib/demo";
import { hasRealAccounts } from "@/modules/auth";
import { resetAndSeedDemoData, type SeedSummary } from "./seed";

export type BootstrapResult =
  | { seeded: false; reason: "already-seeded" | "not-demo" | "real-accounts" }
  | { seeded: true; summary: SeedSummary };

/**
 * DEMO: primera siembra del hosting. Idempotente: si la BD ya tiene datos no hace nada, así que puede correr en cada
 * arranque (el plan gratuito duerme y despierta el servicio). Siembra si no hay usuarios o si falta el historial de
 * ventas que debería haber (una siembra anterior que se cortó a medias).
 *
 * Sin DEMO_MODE=true NO hace nada ("not-demo"): un servicio real que arranque con la misma orden de inicio no debe
 * fallar ni sembrar datos de ejemplo sobre una base vacía. La demo en sí queda igual.
 */
export async function seedDemoDataIfEmpty(): Promise<BootstrapResult> {
  if (!isDemoMode()) return { seeded: false, reason: "not-demo" };
  // La siembra vacía los usuarios si falta el historial: con cuentas reales no se toca nada (y el arranque sigue).
  if (await hasRealAccounts()) {
    console.warn("[demo] DEMO_MODE=true pero la base tiene usuarios con contraseña: no se siembra ni se reinicia nada.");
    return { seeded: false, reason: "real-accounts" };
  }
  const withHistory = demoHistoryEnabled();
  const [users, sales] = await Promise.all([db.user.count(), db.sale.count()]);
  if (users > 0 && (!withHistory || sales > 0)) return { seeded: false, reason: "already-seeded" };
  return { seeded: true, summary: await resetAndSeedDemoData({ history: withHistory }) };
}
