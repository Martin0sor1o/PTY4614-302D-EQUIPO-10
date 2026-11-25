import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/demo";

// DEMO: protección contra una configuración equivocada. Con DEMO_MODE=true el acceso demo no pide contraseña; si la base
// además tiene cuentas reales (alguien con `password_hash`), ese acceso dejaría entrar a la administradora real sin
// contraseña. En ese caso el acceso demo queda deshabilitado, pero el servicio sigue arrancando y el login real sigue
// funcionando (no se aborta el arranque: un bucle de reinicios tumbaría el servicio).
// La demo normal no se ve afectada: ni el seed ni "Reiniciar datos de demo" crean nunca un `password_hash`.

export const DEMO_BLOCKED_MESSAGE = "Acceso demo deshabilitado: la base tiene cuentas reales.";

const CACHE_MS = 3 * 60_000;
let cached: { at: number; realAccounts: boolean } | null = null;

/** ¿Existe algún usuario con contraseña? Consulta directa, sin caché (para acciones destructivas). */
export async function hasRealAccounts(): Promise<boolean> {
  const user = await db.user.findFirst({ where: { passwordHash: { not: null } }, select: { id: true } });
  return user !== null;
}

/**
 * ¿Está permitido el acceso demo? Solo con DEMO_MODE=true y sin cuentas reales en la base. El chequeo se cachea unos
 * minutos (no consulta en cada petición) y deja una advertencia en el log cada vez que lo refresca y encuentra cuentas.
 */
export async function demoAccessEnabled(): Promise<boolean> {
  if (!isDemoMode()) return false;
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    cached = { at: Date.now(), realAccounts: await hasRealAccounts() };
    if (cached.realAccounts) {
      console.warn("[auth] DEMO_MODE=true pero la base tiene usuarios con contraseña: el acceso demo queda deshabilitado. Quita DEMO_MODE o usa una base de demo.");
    }
  }
  return !cached.realAccounts;
}

/** Olvida el resultado cacheado (los tests, y cualquier cambio de cuentas que deba verse de inmediato). */
export function resetDemoGuardCache(): void {
  cached = null;
}
