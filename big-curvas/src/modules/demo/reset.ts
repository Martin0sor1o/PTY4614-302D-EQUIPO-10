import type { Actor } from "@/lib/access";
import { assertAccess } from "@/lib/access";
import { demoHistoryEnabled, isDemoMode } from "@/lib/demo";
import { AppError } from "@/lib/errors";
import { resetAndSeedDemoData, type ResetOptions, type SeedSummary } from "./seed";

/**
 * DEMO: botón "Reiniciar datos de demo". Solo ADMIN y solo con DEMO_MODE=true (se valida aquí, en el servidor):
 * vuelve al seed con historial (Etapa 6.5). Vacía TODAS las tablas de la app, usuarios incluidos.
 */
export async function resetDemoData(input: { actor: Pick<Actor, "role" | "location">; now?: ResetOptions["now"] }): Promise<SeedSummary> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  if (!isDemoMode()) throw new AppError("FORBIDDEN", "El reinicio de datos solo está disponible en modo demostración.");
  return resetAndSeedDemoData({ history: demoHistoryEnabled(), now: input.now });
}
