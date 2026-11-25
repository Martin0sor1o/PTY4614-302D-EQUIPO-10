import { db } from "@/lib/db";
import type { Tx } from "@/lib/db";

// Auditoría de autenticación (regla 9): login, fallo, bloqueo, cierre de sesión, cambio de contraseña y de PIN,
// vinculación y revocación de dispositivos. NUNCA se guardan contraseñas, PIN, tokens, hashes ni emails en claro:
// los eventos de usuarios desconocidos llevan solo una huella HMAC corta del email.

export type AuthAuditAction =
  | "AUTH_LOGIN"
  | "AUTH_LOGIN_FAILED"
  | "AUTH_LOCKED"
  | "AUTH_LOGOUT"
  | "AUTH_PASSWORD_CHANGED"
  | "AUTH_PASSWORD_RESET"
  | "AUTH_ADMIN_CREATED"
  | "AUTH_USER_CREATED"
  | "POS_PIN_SET"
  | "POS_PIN_FAILED"
  | "POS_PIN_LOCKED"
  | "POS_DEVICE_PAIRING_CREATED"
  | "POS_DEVICE_LINKED"
  | "POS_DEVICE_PAIRING_FAILED"
  | "POS_DEVICE_REVOKED";

type Scalar = string | number | boolean | null;

// Defensa en profundidad: ninguna clave de los datos auditados puede sonar a secreto.
const FORBIDDEN_KEY = /pass|pin(?!ned)|token|secret|hash|code|cookie|clave/i;

export interface AuthAuditEvent {
  action: AuthAuditAction;
  userId?: string | null;
  locationId?: string | null;
  entity: "user" | "session" | "pos_device" | "auth";
  entityId?: string | null;
  data?: Record<string, Scalar>;
}

export function assertSafeAuditData(data: Record<string, Scalar> | undefined): void {
  for (const key of Object.keys(data ?? {})) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`Dato de auditoría no permitido: ${key}`);
  }
}

export async function auditAuth(event: AuthAuditEvent, client: Pick<Tx, "auditLog"> = db): Promise<void> {
  assertSafeAuditData(event.data);
  await client.auditLog.create({
    data: {
      userId: event.userId ?? null,
      locationId: event.locationId ?? null,
      action: event.action,
      entity: event.entity,
      entityId: event.entityId ?? null,
      after: event.data ?? undefined,
    },
  });
}
