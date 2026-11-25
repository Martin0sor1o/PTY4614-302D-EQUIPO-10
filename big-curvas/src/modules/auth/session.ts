import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/demo";
import { AppError } from "@/lib/errors";
import { assertAccess, canAccess, type AccessRequirement, type Role, type SessionLocation, type SessionUser } from "@/lib/access";
import { auditAuth } from "./audit";
import {
  activeLocationCookieName,
  clearActiveLocationCookie,
  clearDemoUserCookie,
  clearSessionCookie,
  DEMO_USER_COOKIE,
  sessionCookieName,
  setActiveLocationCookie,
  type CookieReader,
} from "./cookies";
import { resolveSession, revokeSessionByToken, type ResolvedSession } from "./sessions";

// Identidad de la petición. `getCurrentUser()` es el ÚNICO punto por el que la app obtiene el usuario (CLAUDE.md).
//
// Orden: 1) sesión real (cookie con token, validada contra la BD) → 2) solo con DEMO_MODE=true, la cookie de la demo
// ("Entrar como…", sin contraseña) → 3) null. Sin DEMO_MODE la rama demo no existe: una cookie demo se ignora.

function toSessionLocation(l: { id: string; code: string; name: string; type: "STORE" | "WAREHOUSE" }): SessionLocation {
  return { id: l.id, code: l.code, name: l.name, type: l.type };
}

/** El ADMIN opera donde elige (cookie); los demás roles, en su ubicación asignada. */
async function adminActiveLocation(store: CookieReader): Promise<SessionLocation | null> {
  const activeId = store.get(activeLocationCookieName())?.value;
  const chosen = activeId ? await db.location.findFirst({ where: { id: activeId, active: true } }) : null;
  return chosen ? toSessionLocation(chosen) : null;
}

async function fromSession(s: ResolvedSession, store: CookieReader): Promise<SessionUser> {
  const location = s.user.location ? toSessionLocation(s.user.location) : null;
  return {
    id: s.user.id,
    name: s.user.name,
    role: s.user.role as Role,
    location,
    activeLocation: s.user.role === "ADMIN" ? await adminActiveLocation(store) : location,
    mustChangePassword: s.user.mustChangePassword,
    sessionKind: s.kind,
    sessionId: s.sessionId,
    deviceId: s.device?.id ?? null,
  };
}

/** DEMO: la identidad sale de una cookie sin contraseña. Solo se llama con DEMO_MODE=true. */
async function fromDemoCookie(store: CookieReader): Promise<SessionUser | null> {
  const userId = store.get(DEMO_USER_COOKIE)?.value;
  if (!userId) return null;
  const user = await db.user.findFirst({ where: { id: userId, active: true }, include: { location: true } });
  if (!user) return null;
  const location = user.location ? toSessionLocation(user.location) : null;
  return {
    id: user.id,
    name: user.name,
    role: user.role as Role,
    location,
    activeLocation: user.role === "ADMIN" ? await adminActiveLocation(store) : location,
    sessionKind: "DEMO",
  };
}

/** Usuario de las cookies dadas, o null. Separado de `getCurrentUser` para poder probarlo sin el contexto de Next. */
export async function resolveUser(store: CookieReader): Promise<SessionUser | null> {
  const token = store.get(sessionCookieName())?.value;
  if (token) {
    const session = await resolveSession(token);
    if (session) return fromSession(session, store);
  }
  if (isDemoMode()) return fromDemoCookie(store);
  return null;
}

/** Usuario de la petición actual (rol y ubicación incluidos), o null si no hay sesión. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => resolveUser(await cookies()));

export interface RequireAccessOptions {
  /** Solo el cambio de contraseña se permite con contraseña temporal. */
  allowPasswordChange?: boolean;
}

/**
 * Guardia para Server Actions y Route Handlers (CLAUDE.md regla 10): exige sesión, rol y —si se indica—
 * que la ubicación sea la del usuario (ADMIN: cualquiera). Con contraseña temporal rechaza todo salvo cambiarla.
 * Lanza AppError.
 */
export async function requireAccess(requirement: AccessRequirement, options: RequireAccessOptions = {}): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Debes iniciar sesión.");
  if (user.mustChangePassword && !options.allowPasswordChange) {
    throw new AppError("FORBIDDEN", "Debes cambiar tu contraseña temporal antes de continuar.");
  }
  assertAccess(user, requirement);
  return user;
}

/**
 * Guardia para páginas: sin sesión → /login; con contraseña temporal → /cuenta/contrasena; con sesión pero sin rol
 * permitido → /sin-acceso. (Ocultar el menú no es seguridad: cada página y cada acción se valida en el servidor.)
 */
export async function requirePageAccess(roles: readonly Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/cuenta/contrasena");
  if (!canAccess(user, { roles })) redirect("/sin-acceso");
  return user;
}

/** Página con sesión pero sin exigir rol ni cambio de contraseña (la propia pantalla de cambio de contraseña). */
export async function requireSessionPage(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Cierra la sesión: la revoca en la BD (el token deja de servir al instante) y borra las cookies. El dispositivo POS sigue vinculado. */
export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  if (token) {
    const revoked = await revokeSessionByToken(token);
    if (revoked) await auditAuth({ action: "AUTH_LOGOUT", userId: revoked.userId, entity: "session", entityId: revoked.id });
  }
  await clearSessionCookie();
  await clearActiveLocationCookie();
  await clearDemoUserCookie();
}

/** Solo ADMIN: elige la ubicación en la que opera (POS, traslados, recepciones). Sirve en modo real y en demo. */
export async function setActiveLocation(locationId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Debes iniciar sesión.");
  if (user.role !== "ADMIN") throw new AppError("FORBIDDEN", "Solo la administradora puede cambiar de ubicación.");
  const location = await db.location.findFirst({ where: { id: locationId, active: true } });
  if (!location) throw new AppError("NOT_FOUND", "Ubicación no encontrada.");
  await setActiveLocationCookie(location.id);
}
