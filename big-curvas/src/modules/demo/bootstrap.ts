import { db } from "@/lib/db";
import { demoHistoryEnabled } from "@/lib/demo";
import { resetAndSeedDemoData, type SeedSummary } from "./seed";

export type BootstrapResult = { seeded: false; reason: "already-seeded" } | { seeded: true; summary: SeedSummary };

/**
 * DEMO: primera siembra del hosting. Idempotente: si la BD ya tiene datos no hace nada, así que puede correr en cada
 * arranque (el plan gratuito duerme y despierta el servicio). Siembra si no hay usuarios o si falta el historial de
 * ventas que debería haber (una siembra anterior que se cortó a medias). Requiere DEMO_MODE=true (lo valida el seed).
 */
export async function seedDemoDataIfEmpty(): Promise<BootstrapResult> {
  const withHistory = demoHistoryEnabled();
  const [users, sales] = await Promise.all([db.user.count(), db.sale.count()]);
  if (users > 0 && (!withHistory || sales > 0)) return { seeded: false, reason: "already-seeded" };
  return { seeded: true, summary: await resetAndSeedDemoData({ history: withHistory }) };
}
