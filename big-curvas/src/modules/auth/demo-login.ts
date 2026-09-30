import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/demo";
import { AppError } from "@/lib/errors";
import { ACTIVE_LOCATION_COOKIE, DEMO_USER_COOKIE, getCurrentUser } from "./session";

// DEMO: login sin contraseña ("Entrar como…"). Todo este archivo se elimina al implementar autenticación real.

const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 } as const;

export interface DemoLoginOption {
  id: string;
  name: string;
  role: "ADMIN" | "VENDEDORA" | "BODEGA";
  locationName: string | null;
}

function assertDemoMode(): void {
  if (!isDemoMode()) throw new AppError("FORBIDDEN", "El acceso de demostración está deshabilitado.");
}

const ROLE_ORDER = { ADMIN: 0, VENDEDORA: 1, BODEGA: 2 } as const;

export async function listDemoLoginOptions(): Promise<DemoLoginOption[]> {
  if (!isDemoMode()) return [];
  const users = await db.user.findMany({ where: { active: true }, include: { location: true } });
  return users
    .map((u) => ({ id: u.id, name: u.name, role: u.role, locationName: u.location?.name ?? null }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name, "es"));
}

export async function demoLogin(userId: string): Promise<void> {
  assertDemoMode();
  const user = await db.user.findFirst({ where: { id: userId, active: true } });
  if (!user) throw new AppError("NOT_FOUND", "Usuario no encontrado.");
  const store = await cookies();
  store.set(DEMO_USER_COOKIE, user.id, COOKIE_OPTIONS);
  store.delete(ACTIVE_LOCATION_COOKIE); // cada "Entrar como…" parte sin tienda activa
}

export async function demoLogout(): Promise<void> {
  const store = await cookies();
  store.delete(DEMO_USER_COOKIE);
  store.delete(ACTIVE_LOCATION_COOKIE);
}

/** Solo ADMIN: elige la ubicación en la que opera (POS, traspasos, recepciones). */
export async function setActiveLocation(locationId: string): Promise<void> {
  assertDemoMode();
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Debes iniciar sesión.");
  if (user.role !== "ADMIN") throw new AppError("FORBIDDEN", "Solo la administradora puede cambiar de ubicación.");
  const location = await db.location.findFirst({ where: { id: locationId, active: true } });
  if (!location) throw new AppError("NOT_FOUND", "Ubicación no encontrada.");
  const store = await cookies();
  store.set(ACTIVE_LOCATION_COOKIE, location.id, COOKIE_OPTIONS);
}
