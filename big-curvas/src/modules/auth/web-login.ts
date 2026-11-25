import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { needsRehash, hashSecret, spendVerificationTime, verifySecret } from "@/lib/scrypt-hash";
import { auditAuth } from "./audit";
import { fingerprint, hmac } from "./crypto";
import {
  isPlausibleEmail,
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_ATTEMPTS,
  normalizeEmail,
  PASSWORD_CHANGE_LOCK_MINUTES,
  PASSWORD_CHANGE_MAX_ATTEMPTS,
  PASSWORD_MAX_LENGTH,
  validatePassword,
} from "./policy";
import { createSession, revokeUserSessions, type CreatedSession } from "./sessions";
import { clearFailures, reserveAttempt } from "./throttle";

// Login con email y contraseña (administradora y, a futuro, bodega). La vendedora entra por dispositivo + PIN.
// Mensajes genéricos: nunca se revela si el email existe, si la cuenta está inactiva o si la contraseña estuvo cerca.

const GENERIC_FAILURE = "Email o contraseña incorrectos.";
const LOCKED_MESSAGE = "Demasiados intentos. Intenta de nuevo en unos minutos.";

export interface WebLoginResult {
  session: CreatedSession;
  userId: string;
  mustChangePassword: boolean;
}

export async function loginWithPassword(input: { email: string; password: string }): Promise<WebLoginResult> {
  const email = normalizeEmail(input.email);
  const password = input.password;
  const emailFp = fingerprint("email", email);
  const key = `login:${hmac("login", email)}`;

  // El intento se cuenta ANTES de verificar (atómico): las peticiones simultáneas no pueden esquivar el bloqueo. Bloqueado:
  // la respuesta es la misma exista o no la cuenta (la clave es del email escrito, no de un usuario).
  const attempt = await reserveAttempt(key, LOGIN_MAX_ATTEMPTS, LOGIN_LOCK_MINUTES);
  if (!attempt.allowed) throw new AppError("FORBIDDEN", LOCKED_MESSAGE);

  const candidate =
    isPlausibleEmail(email) && password.length > 0 && password.length <= PASSWORD_MAX_LENGTH
      ? await db.user.findFirst({ where: { email, active: true, role: { in: ["ADMIN", "BODEGA"] }, passwordHash: { not: null } } })
      : null;

  // Con email desconocido igual se hace el trabajo de un hash, para que el tiempo no delate si la cuenta existe.
  let ok = false;
  if (candidate?.passwordHash) ok = await verifySecret(password, candidate.passwordHash);
  else await spendVerificationTime(password.slice(0, PASSWORD_MAX_LENGTH));

  if (!candidate || !ok) {
    await auditAuth({ action: "AUTH_LOGIN_FAILED", userId: candidate?.id ?? null, entity: "auth", data: { emailFp, attempts: attempt.attempts } });
    if (attempt.isLastAttempt) {
      await auditAuth({
        action: "AUTH_LOCKED",
        userId: candidate?.id ?? null,
        entity: "auth",
        data: { emailFp, lockedUntil: attempt.lockedUntil?.toISOString() ?? null },
      });
    }
    throw attempt.isLastAttempt ? new AppError("FORBIDDEN", LOCKED_MESSAGE) : new AppError("UNAUTHENTICATED", GENERIC_FAILURE);
  }

  await clearFailures(key);
  // Si el costo del hash subió desde que se guardó, se actualiza con la contraseña recién verificada.
  const rehash = candidate.passwordHash && needsRehash(candidate.passwordHash) ? await hashSecret(password) : null;
  await db.user.update({ where: { id: candidate.id }, data: { lastLoginAt: new Date(), ...(rehash ? { passwordHash: rehash } : {}) } });
  const session = await createSession({ userId: candidate.id, kind: "WEB" });
  await auditAuth({
    action: "AUTH_LOGIN",
    userId: candidate.id,
    locationId: candidate.locationId,
    entity: "session",
    data: { method: "PASSWORD", mustChange: candidate.mustChangePassword },
  });
  return { session, userId: candidate.id, mustChangePassword: candidate.mustChangePassword };
}

/**
 * Cambio de contraseña con la sesión iniciada (también el cambio forzado de la primera contraseña). Exige la actual,
 * aplica la política y revoca las demás sesiones del usuario.
 */
export async function changePassword(input: { userId: string; sessionId: string; current: string; next: string }): Promise<void> {
  const user = await db.user.findFirst({ where: { id: input.userId, active: true, role: { in: ["ADMIN", "BODEGA"] } } });
  if (!user?.passwordHash) throw new AppError("FORBIDDEN", "Esta cuenta no tiene contraseña.");

  const key = `pwchange:${hmac("pwchange", user.id)}`;
  const attempt = await reserveAttempt(key, PASSWORD_CHANGE_MAX_ATTEMPTS, PASSWORD_CHANGE_LOCK_MINUTES);
  if (!attempt.allowed) throw new AppError("FORBIDDEN", LOCKED_MESSAGE);

  const currentOk = input.current.length <= PASSWORD_MAX_LENGTH && (await verifySecret(input.current, user.passwordHash));
  if (!currentOk) {
    await auditAuth({
      action: attempt.isLastAttempt ? "AUTH_LOCKED" : "AUTH_LOGIN_FAILED",
      userId: user.id,
      entity: "auth",
      data: { context: "password_change", attempts: attempt.attempts },
    });
    throw attempt.isLastAttempt ? new AppError("FORBIDDEN", LOCKED_MESSAGE) : new AppError("VALIDATION", "La contraseña actual no es correcta.");
  }
  // Acertó: el contador vuelve a cero (aunque después la nueva contraseña no cumpla la política, la actual ya se demostró).
  await clearFailures(key);

  const problem = validatePassword(input.next, { email: user.email, name: user.name });
  if (problem) throw new AppError("VALIDATION", problem);
  if (input.next === input.current) throw new AppError("VALIDATION", "La nueva contraseña debe ser distinta de la actual.");

  const passwordHash = await hashSecret(input.next);
  await db.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() } });
  const revoked = await revokeUserSessions(user.id, input.sessionId);
  await auditAuth({
    action: "AUTH_PASSWORD_CHANGED",
    userId: user.id,
    locationId: user.locationId,
    entity: "user",
    entityId: user.id,
    data: { forced: user.mustChangePassword, otherSessionsRevoked: revoked },
  });
}
