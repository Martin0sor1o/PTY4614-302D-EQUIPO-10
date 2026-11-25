import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hashSecret } from "@/lib/scrypt-hash";
import { hashPin } from "@/modules/approvals";
import { auditAuth } from "./audit";
import { fingerprint, hmac } from "./crypto";
import { isPlausibleEmail, normalizeEmail, validatePassword, validatePin } from "./policy";
import { revokeUserSessions } from "./sessions";
import { clearFailures } from "./throttle";

// Altas y reinicios de cuentas por SCRIPT (pnpm auth:create-admin, auth:reset-password, auth:create-user). Los
// scripts leen la contraseña temporal de AUTH_INITIAL_PASSWORD (solo en la terminal donde corren) o de un prompt oculto.
// Nada de esto se expone por la web. No hay recuperación por email: el reinicio es siempre por script.

function checkName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) throw new AppError("VALIDATION", "El nombre debe tener entre 2 y 80 caracteres.");
  return trimmed;
}

/** Crea la administradora inicial con contraseña temporal; obliga a cambiarla en el primer ingreso. */
export async function createAdminAccount(input: { email: string; name: string; password: string }): Promise<{ userId: string }> {
  const email = normalizeEmail(input.email);
  if (!isPlausibleEmail(email)) throw new AppError("VALIDATION", "El email no es válido.");
  const name = checkName(input.name);
  const problem = validatePassword(input.password, { email, name });
  if (problem) throw new AppError("VALIDATION", problem);
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new AppError("CONFLICT", "Ya existe un usuario con ese email. Para cambiar su contraseña usa auth:reset-password.");
  }

  const passwordHash = await hashSecret(input.password);
  const user = await db.user.create({ data: { name, email, role: "ADMIN", passwordHash, mustChangePassword: true } });
  await auditAuth({ action: "AUTH_ADMIN_CREATED", userId: null, entity: "user", entityId: user.id, data: { emailFp: fingerprint("email", email) } });
  return { userId: user.id };
}

/** Reinicia la contraseña de una cuenta con email (administradora o bodega): temporal, con cambio forzado. */
export async function resetPasswordAccount(input: { email: string; password: string }): Promise<{ userId: string }> {
  const email = normalizeEmail(input.email);
  const user = await db.user.findFirst({ where: { email, role: { in: ["ADMIN", "BODEGA"] } } });
  if (!user) throw new AppError("NOT_FOUND", "No hay una cuenta con contraseña con ese email.");
  const problem = validatePassword(input.password, { email, name: user.name });
  if (problem) throw new AppError("VALIDATION", problem);

  const passwordHash = await hashSecret(input.password);
  await db.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: true, passwordChangedAt: null } });
  await revokeUserSessions(user.id);
  await clearFailures(`login:${hmac("login", email)}`);
  await auditAuth({ action: "AUTH_PASSWORD_RESET", userId: null, entity: "user", entityId: user.id, data: { emailFp: fingerprint("email", email) } });
  return { userId: user.id };
}

/** Crea una vendedora de una tienda (sin email ni contraseña: entra con el dispositivo y su PIN). El PIN es opcional aquí. */
export async function createSalesAccount(input: { name: string; locationCode: string; pin?: string }): Promise<{ userId: string }> {
  const name = checkName(input.name);
  const location = await db.location.findFirst({ where: { code: input.locationCode, active: true, type: "STORE", sellsPos: true } });
  if (!location) throw new AppError("NOT_FOUND", "No existe una tienda activa con ese código que venda en el POS.");
  let pinHash: string | null = null;
  if (input.pin !== undefined) {
    const problem = validatePin(input.pin);
    if (problem) throw new AppError("VALIDATION", problem);
    pinHash = hashPin(input.pin);
  }
  const user = await db.user.create({ data: { name, role: "VENDEDORA", locationId: location.id, pinHash } });
  await auditAuth({ action: "AUTH_USER_CREATED", userId: null, locationId: location.id, entity: "user", entityId: user.id, data: { role: "VENDEDORA" } });
  return { userId: user.id };
}
