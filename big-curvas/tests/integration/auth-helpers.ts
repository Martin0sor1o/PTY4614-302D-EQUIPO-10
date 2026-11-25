import { createHash, randomBytes, randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { hashSecret } from "@/lib/scrypt-hash";
import { createPairingCode, redeemPairingCode, setSalesPin, type CookieReader } from "@/modules/auth";
import type { Fixtures } from "./helpers";

// Utilidades de los tests de autenticación. Todo secreto de prueba se genera al vuelo: no hay valores fijos en el repo.
// Cookies: en los tests NODE_ENV = "test", así que los nombres son los de desarrollo (sin prefijo __Host-).

export const SESSION_COOKIE = "bc_session";
export const DEVICE_COOKIE = "bc_device";
export const LOCATION_COOKIE = "bc_location";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Contraseña aleatoria que cumple la política (≥ 12, no común, no repetida). */
export const randomPassword = () => `Tp ${randomBytes(9).toString("base64url")} ${randomBytes(3).toString("hex")}`;

/** PIN de 6 dígitos que cumple la política (ni todos iguales ni secuencia). */
export function randomPin(): string {
  for (;;) {
    const pin = String(randomInt(100_000, 1_000_000));
    if (!/^(\d)\1+$/.test(pin) && !"0123456789".includes(pin) && !"9876543210".includes(pin)) return pin;
  }
}

/** PIN distinto de `pin` (para probar fallos). */
export const otherPin = (pin: string) => (pin === "385201" ? "907316" : "385201");

/** Lector de cookies a partir de un objeto (lo que pide `resolveUser`). */
export function jar(entries: Record<string, string | undefined>): CookieReader {
  return { get: (name) => (entries[name] ? { value: entries[name]! } : undefined) };
}

export interface WebUser {
  id: string;
  email: string;
  password: string;
}

/** Usuario con contraseña (ADMIN por omisión), creado directo en la BD para no depender del flujo que se prueba. */
export async function createWebUser(
  opts: { role?: "ADMIN" | "BODEGA"; email?: string; name?: string; mustChange?: boolean; locationId?: string | null } = {},
): Promise<WebUser> {
  const password = randomPassword();
  const email = opts.email ?? `${randomBytes(5).toString("hex")}@auth.test`;
  const user = await db.user.create({
    data: {
      name: opts.name ?? "Usuario de prueba",
      email,
      role: opts.role ?? "ADMIN",
      locationId: opts.locationId ?? null,
      passwordHash: await hashSecret(password),
      mustChangePassword: opts.mustChange ?? false,
    },
  });
  return { id: user.id, email, password };
}

/** Vincula un dispositivo de caja a la tienda por la vía real y devuelve su token (lo que iría en la cookie del equipo). */
export async function linkDevice(f: Fixtures, locationId = f.loc.TIENDA_RANCAGUA, name = "Caja de prueba"): Promise<{ deviceId: string; token: string }> {
  const created = await createPairingCode({ actor: f.actors.belen, locationId, name });
  const linked = await redeemPairingCode({ code: created.code });
  return { deviceId: linked.deviceId, token: linked.token };
}

/** Define el PIN de una vendedora por la vía real (administradora) y lo devuelve. */
export async function setPinFor(f: Fixtures, userId: string, pin = randomPin()): Promise<string> {
  await setSalesPin({ actor: f.actors.belen, userId, pin });
  return pin;
}

export const sessionRow = (token: string) => db.session.findUniqueOrThrow({ where: { tokenHash: sha256(token) } });

/** Envejece una sesión con la hora de la BD: última actividad hace `idleMinutes` y/o vencida hace `expiredMinutes`. */
export async function ageSession(token: string, opts: { idleMinutes?: number; expiredMinutes?: number }): Promise<void> {
  const hash = sha256(token);
  if (opts.idleMinutes !== undefined) {
    await db.$executeRaw`UPDATE sessions SET last_seen_at = now() - make_interval(mins => ${opts.idleMinutes}::int) WHERE token_hash = ${hash}`;
  }
  if (opts.expiredMinutes !== undefined) {
    await db.$executeRaw`UPDATE sessions SET created_at = now() - interval '3 days', expires_at = now() - make_interval(mins => ${opts.expiredMinutes}::int) WHERE token_hash = ${hash}`;
  }
}

/** Texto de todas las filas de audit_log (para comprobar que no filtran secretos). */
export async function auditDump(): Promise<string> {
  return JSON.stringify(await db.auditLog.findMany());
}
