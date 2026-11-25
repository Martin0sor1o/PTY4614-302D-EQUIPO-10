import { z } from "zod";
import { assertAccess, type Actor } from "@/lib/access";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { auditAuth } from "./audit";
import { formatPairingCode, hashToken, hmac, isPairingCodeShape, newPairingCode, newToken, normalizePairingCode } from "./crypto";
import { DEVICE_TOUCH_INTERVAL_S, PAIRING_LOCK_MINUTES, PAIRING_MAX_ATTEMPTS, PAIRING_TTL_MINUTES } from "./policy";
import { revokeDeviceSessions } from "./sessions";
import { clearFailures, reserveAttempt } from "./throttle";

// Dispositivos POS (RF-USR-02): el equipo de la caja se vincula a UNA tienda. Solo una administradora vincula y revoca.
// Flujo: la administradora genera un código de un solo uso (10 min) → en el equipo se canjea en /vincular → el servidor
// entrega un token de dispositivo (cookie) y guarda solo su hash. La vendedora luego entra con su PIN en ese equipo.

const PAIRING_THROTTLE_KEY = "pair";
const PAIRING_FAILURE = "Código inválido o vencido.";

const createSchema = z.object({
  locationId: z.string().min(1).max(64),
  name: z.string().trim().min(2, "Ponle un nombre al equipo (ej. Caja Tienda Rancagua).").max(60),
});

export interface PairingCreated {
  deviceId: string;
  /** Código para dictar o escribir ("ABCD-EFGH"). Se muestra UNA vez: en la BD solo queda su HMAC. */
  code: string;
  expiresAt: Date;
}

export async function createPairingCode(input: { actor: Actor; locationId: string; name: string }): Promise<PairingCreated> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  const data = createSchema.safeParse({ locationId: input.locationId, name: input.name });
  if (!data.success) throw new AppError("VALIDATION", data.error.issues[0]?.message ?? "Datos inválidos.");

  const location = await db.location.findFirst({ where: { id: data.data.locationId, active: true, type: "STORE", sellsPos: true } });
  if (!location) throw new AppError("NOT_FOUND", "Elige una tienda que venda en el POS.");

  const code = newPairingCode();
  const rows = await db.$queryRaw<{ id: string; pairing_expires_at: Date }[]>`
    INSERT INTO pos_devices (id, location_id, name, pairing_code_hash, pairing_expires_at, registered_by, active, created_at, updated_at)
    VALUES (${crypto.randomUUID()}, ${location.id}, ${data.data.name}, ${hmac("pair", code)},
            now() + make_interval(mins => ${PAIRING_TTL_MINUTES}::int), ${input.actor.id}, true, now(), now())
    RETURNING id, pairing_expires_at`;
  await auditAuth({
    action: "POS_DEVICE_PAIRING_CREATED",
    userId: input.actor.id,
    locationId: location.id,
    entity: "pos_device",
    entityId: rows[0].id,
    data: { name: data.data.name },
  });
  return { deviceId: rows[0].id, code: formatPairingCode(code), expiresAt: rows[0].pairing_expires_at };
}

export interface LinkedDevice {
  /** Token del dispositivo: va SOLO a la cookie del equipo. */
  token: string;
  deviceId: string;
  locationId: string;
}

/** Canjea el código en el equipo de la caja. Un solo uso; con límite de intentos fallidos. */
export async function redeemPairingCode(input: { code: string }): Promise<LinkedDevice> {
  // El intento se cuenta ANTES de probar el código (atómico): los canjes simultáneos no esquivan el límite.
  const attempt = await reserveAttempt(PAIRING_THROTTLE_KEY, PAIRING_MAX_ATTEMPTS, PAIRING_LOCK_MINUTES);
  if (!attempt.allowed) {
    throw new AppError("FORBIDDEN", "Demasiados intentos. Pide a la administradora un código nuevo e inténtalo en unos minutos.");
  }
  const code = normalizePairingCode(input.code);

  let claimed: { id: string; location_id: string } | undefined;
  const token = newToken();
  if (isPairingCodeShape(code)) {
    // Un solo UPDATE condicional: el código solo sirve una vez, aunque lleguen dos canjes a la vez.
    const rows = await db.$queryRaw<{ id: string; location_id: string }[]>`
      UPDATE pos_devices
      SET device_token_hash = ${hashToken(token)}, pairing_code_hash = NULL, pairing_expires_at = NULL,
          paired_at = now(), last_seen_at = now(), updated_at = now()
      WHERE pairing_code_hash = ${hmac("pair", code)} AND pairing_expires_at > now()
        AND device_token_hash IS NULL AND active
      RETURNING id, location_id`;
    claimed = rows[0];
  }

  if (!claimed) {
    await auditAuth({ action: "POS_DEVICE_PAIRING_FAILED", entity: "auth", data: { attempts: attempt.attempts } });
    throw new AppError("VALIDATION", PAIRING_FAILURE);
  }

  await clearFailures(PAIRING_THROTTLE_KEY);

  await auditAuth({ action: "POS_DEVICE_LINKED", locationId: claimed.location_id, entity: "pos_device", entityId: claimed.id });
  return { token, deviceId: claimed.id, locationId: claimed.location_id };
}

/** Revoca un dispositivo: deja de servir y corta al instante las sesiones de caja abiertas desde él. */
export async function revokeDevice(input: { actor: Actor; deviceId: string }): Promise<{ sessionsRevoked: number }> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  const rows = await db.$queryRaw<{ id: string; location_id: string }[]>`
    UPDATE pos_devices
    SET active = false, revoked_at = now(), revoked_by = ${input.actor.id},
        pairing_code_hash = NULL, pairing_expires_at = NULL, updated_at = now()
    WHERE id = ${input.deviceId} AND active
    RETURNING id, location_id`;
  if (!rows[0]) throw new AppError("NOT_FOUND", "Ese dispositivo no existe o ya estaba revocado.");
  const sessionsRevoked = await revokeDeviceSessions(rows[0].id);
  await auditAuth({
    action: "POS_DEVICE_REVOKED",
    userId: input.actor.id,
    locationId: rows[0].location_id,
    entity: "pos_device",
    entityId: rows[0].id,
    data: { sessionsRevoked },
  });
  return { sessionsRevoked };
}

export type DeviceStatus = "PENDIENTE" | "CODIGO_VENCIDO" | "VINCULADO" | "REVOCADO";

export interface DeviceRow {
  id: string;
  name: string;
  locationId: string;
  locationName: string;
  status: DeviceStatus;
  pairingExpiresAt: Date | null;
  pairedAt: Date | null;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
}

export async function listDevices(actor: Actor): Promise<DeviceRow[]> {
  assertAccess(actor, { roles: ["ADMIN"] });
  const rows = await db.posDevice.findMany({ include: { location: true }, orderBy: [{ active: "desc" }, { createdAt: "desc" }] });
  const now = Date.now();
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    locationId: d.locationId,
    locationName: d.location.name,
    status: !d.active ? "REVOCADO" : d.deviceTokenHash ? "VINCULADO" : d.pairingExpiresAt && d.pairingExpiresAt.getTime() > now ? "PENDIENTE" : "CODIGO_VENCIDO",
    pairingExpiresAt: d.pairingExpiresAt,
    pairedAt: d.pairedAt,
    lastSeenAt: d.lastSeenAt,
    revokedAt: d.revokedAt,
  }));
}

export interface ResolvedDevice {
  id: string;
  name: string;
  locationId: string;
  locationName: string;
}

/** Dispositivo vigente para el token de la cookie, o null (revocado, desconocido o sin vincular). */
export async function resolveDevice(token: string | undefined): Promise<ResolvedDevice | null> {
  if (!token || token.length > 200) return null;
  const device = await db.posDevice.findFirst({
    where: { deviceTokenHash: hashToken(token), active: true },
    include: { location: true },
  });
  if (!device || !device.location.active) return null;
  await db.$executeRaw`
    UPDATE pos_devices SET last_seen_at = now()
    WHERE id = ${device.id} AND (last_seen_at IS NULL OR last_seen_at < now() - make_interval(secs => ${DEVICE_TOUCH_INTERVAL_S}::int))`;
  return { id: device.id, name: device.name, locationId: device.locationId, locationName: device.location.name };
}
