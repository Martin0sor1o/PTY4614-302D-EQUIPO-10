import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/demo";
import { AppError } from "@/lib/errors";
import { assertAccess, canAccess, type AccessRequirement, type Role, type SessionLocation, type SessionUser } from "@/lib/access";

// DEMO: la identidad se toma de una cookie sin contraseña. Reemplazar TODO este archivo por autenticación real
// (Better Auth) conservando las firmas de getCurrentUser / requireAccess / requirePageAccess.
export const DEMO_USER_COOKIE = "demo_user_id";
export const ACTIVE_LOCATION_COOKIE = "demo_active_location";

function toSessionLocation(l: { id: string; code: string; name: string; type: "STORE" | "WAREHOUSE" }): SessionLocation {
  return { id: l.id, code: l.code, name: l.name, type: l.type };
}

/**
 * Usuario de la petición actual (rol y ubicación incluidos), o null si no hay sesión.
 * Es el ÚNICO punto por el que la app obtiene la identidad.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // DEMO: sin DEMO_MODE no hay autenticación disponible todavía.
  if (!isDemoMode()) return null;

  const store = await cookies();
  const userId = store.get(DEMO_USER_COOKIE)?.value;
  if (!userId) return null;

  const user = await db.user.findFirst({
    where: { id: userId, active: true },
    include: { location: true },
  });
  if (!user) return null;

  const location = user.location ? toSessionLocation(user.location) : null;

  let activeLocation = location;
  if (user.role === "ADMIN") {
    const activeId = store.get(ACTIVE_LOCATION_COOKIE)?.value;
    const chosen = activeId ? await db.location.findFirst({ where: { id: activeId, active: true } }) : null;
    activeLocation = chosen ? toSessionLocation(chosen) : null;
  }

  return { id: user.id, name: user.name, role: user.role as Role, location, activeLocation };
});

/**
 * Guardia para Server Actions y Route Handlers (CLAUDE.md regla 10): exige sesión, rol y —si se indica—
 * que la ubicación sea la del usuario (ADMIN: cualquiera). Lanza AppError.
 */
export async function requireAccess(requirement: AccessRequirement): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Debes iniciar sesión.");
  assertAccess(user, requirement);
  return user;
}

/**
 * Guardia para páginas: sin sesión → /login; con sesión pero sin rol permitido → /sin-acceso.
 * (Ocultar el menú no es seguridad: cada página y cada acción se valida en el servidor.)
 */
export async function requirePageAccess(roles: readonly Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, { roles })) redirect("/sin-acceso");
  return user;
}
