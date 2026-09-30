import { AppError } from "@/lib/errors";

// Control de acceso por ROL y UBICACIÓN (CLAUDE.md regla 10). Lógica pura, sin BD ni Next.
// Las Server Actions lo usan a través de `requireAccess` (src/modules/auth), que obtiene el usuario actual.

export type Role = "ADMIN" | "VENDEDORA" | "BODEGA";

export interface SessionLocation {
  id: string;
  code: string;
  name: string;
  type: "STORE" | "WAREHOUSE";
}

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  /** Ubicación asignada. null solo para ADMIN. */
  location: SessionLocation | null;
  /**
   * Ubicación en la que opera ahora: la asignada (VENDEDORA/BODEGA) o la "tienda activa"
   * que elige el ADMIN. null si el ADMIN aún no eligió.
   */
  activeLocation: SessionLocation | null;
}

export interface AccessRequirement {
  roles: readonly Role[];
  /**
   * Ubicación sobre la que se quiere ESCRIBIR. VENDEDORA y BODEGA solo pueden operar en la suya;
   * ADMIN en cualquiera. Omitir para acciones sin ubicación o de solo lectura.
   */
  locationId?: string;
}

/** Valida rol y ubicación. Lanza AppError FORBIDDEN si no corresponde. */
export function assertAccess(user: SessionUser, requirement: AccessRequirement): void {
  if (!requirement.roles.includes(user.role)) {
    throw new AppError("FORBIDDEN", "Tu rol no tiene permiso para esta acción.");
  }
  if (requirement.locationId !== undefined && user.role !== "ADMIN") {
    if (user.location?.id !== requirement.locationId) {
      throw new AppError("FORBIDDEN", "Solo puedes operar en tu propia ubicación.");
    }
  }
}

export function canAccess(user: SessionUser, requirement: AccessRequirement): boolean {
  try {
    assertAccess(user, requirement);
    return true;
  } catch {
    return false;
  }
}
