import { assertAccess, type Actor } from "@/lib/access";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { verifySecret } from "@/lib/scrypt-hash";
import { hashPin, verifyPin } from "@/modules/approvals";
import { auditAuth } from "./audit";
import { hmac } from "./crypto";
import {
  PASSWORD_CHANGE_LOCK_MINUTES,
  PASSWORD_CHANGE_MAX_ATTEMPTS,
  PASSWORD_MAX_LENGTH,
  PIN_LOCK_MINUTES_DEFAULT,
  PIN_MAX_ATTEMPTS_DEFAULT,
  SETTING_PIN_LOCK,
  SETTING_PIN_MAX,
  validatePin,
} from "./policy";
import { createSession, revokeUserSessions, type CreatedSession } from "./sessions";
import { resolveDevice, type ResolvedDevice } from "./pos-devices";
import { clearFailures, lockedUntil, registerFailure } from "./throttle";

// Caja compartida (RF-USR-02, RN-29): el equipo ya está vinculado a una tienda; cada vendedora se identifica con su PIN
// de 6 dígitos y solo ve su ubicación. Los fallos de PIN usan los mismos contadores y límites que la aprobación
// presencial (`users.failed_pin_attempts`, `pin_max_attempts`, `pin_lock_minutes`).

const NOT_LINKED = "Este equipo no está vinculado a una tienda. Pide a la administradora un código de vinculación.";
const PIN_FAILURE = "PIN incorrecto.";

async function intSetting(key: string, fallback: number): Promise<number> {
  const s = await db.setting.findUnique({ where: { key } });
  return s?.valueInt ?? fallback;
}

export interface OperatorOption {
  id: string;
  name: string;
}

/** Vendedoras que pueden entrar en este equipo: activas, de la tienda del dispositivo y con PIN definido. */
export async function listOperators(deviceToken: string | undefined): Promise<{ device: ResolvedDevice; operators: OperatorOption[] } | null> {
  const device = await resolveDevice(deviceToken);
  if (!device) return null;
  const users = await db.user.findMany({
    where: { role: "VENDEDORA", active: true, locationId: device.locationId, pinHash: { not: null } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { device, operators: users };
}

export interface PosLoginResult {
  session: CreatedSession;
  userId: string;
  locationId: string;
}

export async function loginWithPin(input: { deviceToken: string | undefined; userId: string; pin: string }): Promise<PosLoginResult> {
  const device = await resolveDevice(input.deviceToken);
  if (!device) throw new AppError("FORBIDDEN", NOT_LINKED);

  // Solo vendedoras de la tienda de ESTE dispositivo. Cualquier otra cosa da el mismo mensaje que un PIN equivocado.
  const user = await db.user.findFirst({
    where: { id: input.userId, role: "VENDEDORA", active: true, locationId: device.locationId, pinHash: { not: null } },
  });
  if (!user?.pinHash) throw new AppError("VALIDATION", PIN_FAILURE);

  const maxAttempts = await intSetting(SETTING_PIN_MAX, PIN_MAX_ATTEMPTS_DEFAULT);
  const lockMinutes = await intSetting(SETTING_PIN_LOCK, PIN_LOCK_MINUTES_DEFAULT);

  // Un bloqueo ya terminado se limpia antes de contar.
  await db.$executeRaw`UPDATE users SET failed_pin_attempts = 0, pin_locked_until = NULL
    WHERE id = ${user.id} AND pin_locked_until IS NOT NULL AND pin_locked_until <= now()`;
  const state = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { pinLockedUntil: true } });
  if (state.pinLockedUntil && state.pinLockedUntil > new Date()) {
    throw new AppError("FORBIDDEN", "Demasiados intentos. Tu PIN está bloqueado por unos minutos; pide ayuda a la administradora.", {
      lockedUntil: state.pinLockedUntil.toISOString(),
    });
  }

  if (!verifyPin(input.pin, user.pinHash)) {
    const [after] = await db.$queryRaw<{ failed_pin_attempts: number; pin_locked_until: Date | null }[]>`
      UPDATE users
      SET failed_pin_attempts = failed_pin_attempts + 1,
          pin_locked_until = CASE WHEN failed_pin_attempts + 1 >= ${maxAttempts} THEN now() + make_interval(mins => ${lockMinutes}::int) ELSE pin_locked_until END
      WHERE id = ${user.id}
      RETURNING failed_pin_attempts, pin_locked_until`;
    const locked = after.pin_locked_until !== null;
    await auditAuth({
      action: locked ? "POS_PIN_LOCKED" : "POS_PIN_FAILED",
      userId: user.id,
      locationId: device.locationId,
      entity: "user",
      entityId: user.id,
      data: { deviceId: device.id, attempts: after.failed_pin_attempts },
    });
    const remaining = Math.max(0, maxAttempts - after.failed_pin_attempts);
    throw new AppError(
      "VALIDATION",
      locked
        ? `PIN incorrecto. Tu PIN se bloqueó por ${lockMinutes} minutos.`
        : `PIN incorrecto. Quedan ${remaining} intento${remaining === 1 ? "" : "s"}.`,
      { remainingAttempts: remaining, locked },
    );
  }

  await db.user.update({ where: { id: user.id }, data: { failedPinAttempts: 0, pinLockedUntil: null, lastLoginAt: new Date() } });
  const session = await createSession({ userId: user.id, kind: "POS", posDeviceId: device.id });
  await auditAuth({
    action: "AUTH_LOGIN",
    userId: user.id,
    locationId: device.locationId,
    entity: "session",
    data: { method: "PIN", deviceId: device.id },
  });
  return { session, userId: user.id, locationId: device.locationId };
}

// ─────────────────────────── Equipo: PIN de las vendedoras (solo ADMIN) ───────────────────────────

export interface TeamMember {
  id: string;
  name: string;
  locationName: string | null;
  hasPin: boolean;
  pinLockedUntil: Date | null;
}

export async function listSalesTeam(actor: Actor): Promise<TeamMember[]> {
  assertAccess(actor, { roles: ["ADMIN"] });
  const users = await db.user.findMany({
    where: { role: "VENDEDORA", active: true },
    include: { location: true },
    orderBy: [{ location: { name: "asc" } }, { name: "asc" }],
  });
  const now = new Date();
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    locationName: u.location?.name ?? null,
    hasPin: u.pinHash !== null,
    pinLockedUntil: u.pinLockedUntil && u.pinLockedUntil > now ? u.pinLockedUntil : null,
  }));
}

/** La administradora define o restablece el PIN (6 dígitos) de una vendedora. Desbloquea, y cierra sus sesiones de caja. */
export async function setSalesPin(input: { actor: Actor; userId: string; pin: string }): Promise<void> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  const problem = validatePin(input.pin);
  if (problem) throw new AppError("VALIDATION", problem);
  const target = await db.user.findFirst({ where: { id: input.userId, role: "VENDEDORA", active: true } });
  if (!target) throw new AppError("NOT_FOUND", "No existe esa vendedora.");

  await db.user.update({ where: { id: target.id }, data: { pinHash: hashPin(input.pin), failedPinAttempts: 0, pinLockedUntil: null } });
  await revokeUserSessions(target.id);
  await auditAuth({
    action: "POS_PIN_SET",
    userId: input.actor.id,
    locationId: target.locationId,
    entity: "user",
    entityId: target.id,
    data: { target: "vendedora" },
  });
}

/** ¿La administradora ya tiene PIN de aprobación? (solo el dato, nunca el hash) */
export async function hasApprovalPin(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { pinHash: true } });
  return user?.pinHash != null;
}

/**
 * La administradora define su PIN de aprobación presencial (RF-AUT-05), confirmando con su contraseña. Mismo formato y
 * mismos límites que el de las vendedoras: 6 dígitos.
 */
export async function setOwnApprovalPin(input: { actor: Actor; password: string; pin: string }): Promise<void> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  const user = await db.user.findFirst({ where: { id: input.actor.id, role: "ADMIN", active: true } });
  if (!user?.passwordHash) throw new AppError("FORBIDDEN", "Esta cuenta no tiene contraseña.");

  const key = `pwchange:${hmac("pwchange", user.id)}`;
  if (await lockedUntil(key)) throw new AppError("FORBIDDEN", "Demasiados intentos. Intenta de nuevo en unos minutos.");
  const ok = input.password.length <= PASSWORD_MAX_LENGTH && (await verifySecret(input.password, user.passwordHash));
  if (!ok) {
    const failure = await registerFailure(key, PASSWORD_CHANGE_MAX_ATTEMPTS, PASSWORD_CHANGE_LOCK_MINUTES);
    await auditAuth({
      action: failure.justLocked ? "AUTH_LOCKED" : "AUTH_LOGIN_FAILED",
      userId: user.id,
      entity: "auth",
      data: { context: "approval_pin", attempts: failure.attempts },
    });
    throw new AppError("VALIDATION", "La contraseña no es correcta.");
  }
  await clearFailures(key);
  const problem = validatePin(input.pin);
  if (problem) throw new AppError("VALIDATION", problem);

  await db.user.update({ where: { id: user.id }, data: { pinHash: hashPin(input.pin), failedPinAttempts: 0, pinLockedUntil: null } });
  await auditAuth({ action: "POS_PIN_SET", userId: user.id, entity: "user", entityId: user.id, data: { target: "administradora" } });
}
