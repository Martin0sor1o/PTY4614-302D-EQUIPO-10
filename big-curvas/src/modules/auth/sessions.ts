import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { hashToken, newToken } from "./crypto";
import { POS_SESSION, SESSION_TOUCH_INTERVAL_S, WEB_SESSION } from "./policy";

// Sesiones en la BD. El token vive solo en la cookie del navegador; aquí va su SHA-256. El vencimiento por
// inactividad y el absoluto se calculan con la hora de la BD, así que no dependen de la cookie ni del reloj del servidor.

export type SessionKind = "WEB" | "POS";

const seconds = (ms: number) => Math.round(ms / 1000);

export interface CreatedSession {
  token: string;
  expiresAt: Date;
  /** Segundos que debe durar la cookie (el vencimiento absoluto; la inactividad la aplica la BD). */
  maxAgeSeconds: number;
}

export async function createSession(input: { userId: string; kind: SessionKind; posDeviceId?: string | null }): Promise<CreatedSession> {
  const policy = input.kind === "POS" ? POS_SESSION : WEB_SESSION;
  const token = newToken();
  const rows = await db.$queryRaw<{ expires_at: Date }[]>`
    INSERT INTO sessions (id, token_hash, user_id, kind, pos_device_id, created_at, last_seen_at, expires_at)
    VALUES (
      ${randomUUID()}, ${hashToken(token)}, ${input.userId}, ${input.kind}::session_kind, ${input.posDeviceId ?? null},
      now(), now(), now() + make_interval(secs => ${seconds(policy.absoluteMs)}::int)
    )
    RETURNING expires_at`;
  return { token, expiresAt: rows[0].expires_at, maxAgeSeconds: seconds(policy.absoluteMs) };
}

export interface ResolvedSession {
  sessionId: string;
  kind: SessionKind;
  user: {
    id: string;
    name: string;
    role: "ADMIN" | "VENDEDORA" | "BODEGA";
    mustChangePassword: boolean;
    location: { id: string; code: string; name: string; type: "STORE" | "WAREHOUSE" } | null;
  };
  device: { id: string; name: string; locationId: string } | null;
}

/**
 * Sesión válida para el token, o null: revocada, vencida (absoluta o por inactividad), usuario inactivo, o —en caja—
 * dispositivo revocado / usuario que ya no es de esa tienda. Revocar un dispositivo corta sus sesiones al instante.
 */
export async function resolveSession(token: string): Promise<ResolvedSession | null> {
  if (!token || token.length > 200) return null;
  const rows = await db.$queryRaw<{ id: string; kind: SessionKind; user_id: string; pos_device_id: string | null }[]>`
    SELECT id, kind::text AS kind, user_id, pos_device_id
    FROM sessions
    WHERE token_hash = ${hashToken(token)}
      AND revoked_at IS NULL
      AND expires_at > now()
      AND last_seen_at > now() - (CASE WHEN kind = 'POS'::session_kind
            THEN make_interval(secs => ${seconds(POS_SESSION.idleMs)}::int)
            ELSE make_interval(secs => ${seconds(WEB_SESSION.idleMs)}::int) END)`;
  const row = rows[0];
  if (!row) return null;

  const user = await db.user.findFirst({ where: { id: row.user_id, active: true }, include: { location: true } });
  if (!user) return null;

  let device: ResolvedSession["device"] = null;
  if (row.kind === "POS") {
    // La caja solo la usa una vendedora de la misma tienda del dispositivo, y el dispositivo debe seguir vigente.
    const d = row.pos_device_id ? await db.posDevice.findFirst({ where: { id: row.pos_device_id, active: true } }) : null;
    if (!d || user.role !== "VENDEDORA" || user.locationId !== d.locationId) return null;
    device = { id: d.id, name: d.name, locationId: d.locationId };
  } else if (user.role === "VENDEDORA" || !user.passwordHash) {
    return null; // la vendedora no entra por la vía web
  }

  await db.$executeRaw`
    UPDATE sessions SET last_seen_at = now()
    WHERE id = ${row.id} AND last_seen_at < now() - make_interval(secs => ${SESSION_TOUCH_INTERVAL_S}::int)`;

  return {
    sessionId: row.id,
    kind: row.kind,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      location: user.location ? { id: user.location.id, code: user.location.code, name: user.location.name, type: user.location.type } : null,
    },
    device,
  };
}

/** Cierra la sesión del token (cerrar sesión). Devuelve el usuario y la sesión afectados, o null si ya no valía. */
export async function revokeSessionByToken(token: string): Promise<{ id: string; userId: string } | null> {
  if (!token || token.length > 200) return null;
  const rows = await db.$queryRaw<{ id: string; user_id: string }[]>`
    UPDATE sessions SET revoked_at = now()
    WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL
    RETURNING id, user_id`;
  return rows[0] ? { id: rows[0].id, userId: rows[0].user_id } : null;
}

/** Revoca todas las sesiones de un usuario (menos, opcionalmente, una). Devuelve cuántas. */
export async function revokeUserSessions(userId: string, exceptSessionId?: string | null): Promise<number> {
  return db.$executeRaw`
    UPDATE sessions SET revoked_at = now()
    WHERE user_id = ${userId} AND revoked_at IS NULL AND (${exceptSessionId ?? null}::text IS NULL OR id <> ${exceptSessionId ?? null})`;
}

/** Revoca las sesiones de caja abiertas desde un dispositivo. */
export async function revokeDeviceSessions(deviceId: string): Promise<number> {
  return db.$executeRaw`UPDATE sessions SET revoked_at = now() WHERE pos_device_id = ${deviceId} AND revoked_at IS NULL`;
}
