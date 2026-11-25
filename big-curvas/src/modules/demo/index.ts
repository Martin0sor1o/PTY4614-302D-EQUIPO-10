// API pública del módulo demo. DEMO: solo funciona con DEMO_MODE=true.
export { resetAndSeedDemoData, ean13, type ResetOptions, type SeedSummary } from "./seed";
export { resetDemoData } from "./reset";
export { seedDemoDataIfEmpty, type BootstrapResult } from "./bootstrap";
// `runDemoHistory` (history.ts) NO se exporta: solo corre desde el seed/reinicio con DEMO_MODE.
import { isDemoMode } from "@/lib/demo";
import { demoAdminPin } from "./seed-data";

/**
 * DEMO: pista del PIN de Belén para la aprobación presencial. Solo con DEMO_MODE=true y con DEMO_ADMIN_PIN definida
 * (el valor no está en el repositorio); en cualquier otro caso, null: sin DEMO_MODE no existe ningún PIN demo.
 */
export function demoPinHint(): string | null {
  return isDemoMode() ? demoAdminPin() : null;
}
