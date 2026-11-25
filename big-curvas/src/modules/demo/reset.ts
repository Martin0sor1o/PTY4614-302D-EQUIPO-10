import type { Actor } from "@/lib/access";
import { assertAccess } from "@/lib/access";
import { demoHistoryEnabled, isDemoMode } from "@/lib/demo";
import { AppError } from "@/lib/errors";
import { hasRealAccounts } from "@/modules/auth";
import { resetAndSeedDemoData, type ResetOptions, type SeedSummary } from "./seed";

/**
 * DEMO: botón "Reiniciar datos de demo". Solo ADMIN y solo con DEMO_MODE=true (se valida aquí, en el servidor):
 * vuelve al seed con historial (Etapa 6.5). Vacía TODAS las tablas de la app, usuarios incluidos.
 */
export async function resetDemoData(input: { actor: Pick<Actor, "role" | "location">; now?: ResetOptions["now"] }): Promise<SeedSummary> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  if (!isDemoMode()) throw new AppError("FORBIDDEN", "El reinicio de datos solo está disponible en modo demostración.");
  // Vacía los usuarios también: con cuentas reales en la base (DEMO_MODE puesto por error) no se reinicia nada.
  if (await hasRealAccounts()) throw new AppError("FORBIDDEN", "No se puede reiniciar: la base tiene cuentas reales.");
  return resetAndSeedDemoData({ history: demoHistoryEnabled(), now: input.now });
}
