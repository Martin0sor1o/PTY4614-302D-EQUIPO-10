// API pública del módulo demo. DEMO: solo funciona con DEMO_MODE=true.
export { resetAndSeedDemoData, ean13, type SeedSummary } from "./seed";
import { isDemoMode } from "@/lib/demo";
import { DEMO_ADMIN_PIN } from "./seed-data";

/** DEMO: pista del PIN de Belén para la aprobación presencial. Solo con DEMO_MODE=true; en cualquier otro caso, null. */
export function demoPinHint(): string | null {
  return isDemoMode() ? DEMO_ADMIN_PIN : null;
}
