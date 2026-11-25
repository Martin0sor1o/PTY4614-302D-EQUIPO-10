import { db } from "@/lib/db";

// Intentos por clave (tabla auth_throttles). La clave es un HMAC (src/modules/auth/crypto.ts), así que el mismo trato se
// da a una cuenta que existe y a una que no: no se puede averiguar si un email está registrado.
//
// "Contar y luego verificar": cada intento se RESERVA (se cuenta) ANTES de verificar la contraseña, el PIN o el código, con
// un solo INSERT … ON CONFLICT DO UPDATE atómico y con la hora de la BD. Así N peticiones simultáneas no pueden esquivar el
// bloqueo (el patrón "revisar si está bloqueado y recién después contar el fallo" deja pasar a todas las que llegan antes
// del primer fallo): como mucho `maxAttempts` peticiones llegan a verificar y el resto se rechaza sin gastar CPU. Un acierto
// reinicia el contador (`clearFailures`). Un bloqueo ya vencido se reinicia solo en el siguiente intento. No se borran
// filas (solo `pnpm auth:purge`).

export interface AttemptReservation {
  /** true si este intento puede verificarse; false si la clave ya estaba bloqueada (no se verifica nada). */
  allowed: boolean;
  /** Intentos contados, incluido este (se topa en max + 1: un atacante no hace crecer el número sin límite). */
  attempts: number;
  /** true si ESTE intento es el último permitido: si falla, la clave queda bloqueada (ya lo está desde que se reservó). */
  isLastAttempt: boolean;
  lockedUntil: Date | null;
}

/**
 * Reserva un intento ANTES de verificar. Con el intento número `maxAttempts` la clave queda bloqueada `lockMinutes` (así las
 * peticiones simultáneas a ese intento ya se rechazan); si ese intento acierta, `clearFailures` la desbloquea. Mientras está
 * bloqueada no se extiende el bloqueo (si no, quien insiste lo prolongaría para siempre).
 */
export async function reserveAttempt(key: string, maxAttempts: number, lockMinutes: number): Promise<AttemptReservation> {
  const rows = await db.$queryRaw<{ failed_attempts: number; locked_until: Date | null }[]>`
    INSERT INTO auth_throttles AS t (key, failed_attempts, locked_until, updated_at)
    VALUES (
      ${key}, 1,
      CASE WHEN 1 >= ${maxAttempts} THEN now() + make_interval(mins => ${lockMinutes}::int) ELSE NULL END,
      now()
    )
    ON CONFLICT (key) DO UPDATE SET
      failed_attempts = CASE
        WHEN t.locked_until IS NOT NULL AND t.locked_until <= now() THEN 1
        ELSE LEAST(t.failed_attempts + 1, ${maxAttempts}::int + 1) END,
      locked_until = CASE
        WHEN t.locked_until IS NOT NULL AND t.locked_until > now() THEN t.locked_until
        WHEN (CASE WHEN t.locked_until IS NOT NULL AND t.locked_until <= now() THEN 1 ELSE t.failed_attempts + 1 END) >= ${maxAttempts}
          THEN now() + make_interval(mins => ${lockMinutes}::int)
        ELSE NULL END,
      updated_at = now()
    RETURNING t.failed_attempts, t.locked_until`;
  const row = rows[0];
  return {
    attempts: row.failed_attempts,
    // Las reservas se aplican de una en una (bloqueo de fila): solo las primeras `maxAttempts` quedan en 1..max.
    allowed: row.failed_attempts <= maxAttempts,
    isLastAttempt: row.failed_attempts === maxAttempts,
    lockedUntil: row.locked_until,
  };
}

/** Éxito: la clave vuelve a cero intentos y se desbloquea. No borra la fila. */
export async function clearFailures(key: string): Promise<void> {
  await db.$executeRaw`
    UPDATE auth_throttles SET failed_attempts = 0, locked_until = NULL, updated_at = now()
    WHERE key = ${key} AND (failed_attempts <> 0 OR locked_until IS NOT NULL)`;
}
