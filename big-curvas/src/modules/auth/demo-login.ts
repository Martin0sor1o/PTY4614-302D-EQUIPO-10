import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/demo";
import { AppError } from "@/lib/errors";
import { clearActiveLocationCookie, setDemoUserCookie } from "./cookies";
import { DEMO_BLOCKED_MESSAGE, demoAccessEnabled } from "./demo-guard";

// DEMO: login sin contraseña ("Entrar como…"). Sin DEMO_MODE=true NO existe: no lista usuarios y rechaza el ingreso.
// Es lo único de este módulo que se retira si algún día se quita la demo.

export interface DemoLoginOption {
  id: string;
  name: string;
  role: "ADMIN" | "VENDEDORA" | "BODEGA";
  locationName: string | null;
}

async function assertDemoAccess(): Promise<void> {
  if (!isDemoMode()) throw new AppError("FORBIDDEN", "El acceso de demostración está deshabilitado.");
  if (!(await demoAccessEnabled())) throw new AppError("FORBIDDEN", DEMO_BLOCKED_MESSAGE);
}

const ROLE_ORDER = { ADMIN: 0, VENDEDORA: 1, BODEGA: 2 } as const;

export async function listDemoLoginOptions(): Promise<DemoLoginOption[]> {
  if (!isDemoMode()) return [];
  if (!(await demoAccessEnabled())) throw new AppError("FORBIDDEN", DEMO_BLOCKED_MESSAGE); // con cuentas reales no se lista a nadie
  const users = await db.user.findMany({ where: { active: true }, include: { location: true } });
  return users
    .map((u) => ({ id: u.id, name: u.name, role: u.role, locationName: u.location?.name ?? null }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name, "es"));
}

export async function demoLogin(userId: string): Promise<void> {
  await assertDemoAccess();
  const user = await db.user.findFirst({ where: { id: userId, active: true } });
  if (!user) throw new AppError("NOT_FOUND", "Usuario no encontrado.");
  await setDemoUserCookie(user.id);
  await clearActiveLocationCookie(); // cada "Entrar como…" parte sin tienda activa
}
