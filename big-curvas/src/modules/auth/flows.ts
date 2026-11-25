import { cookies } from "next/headers";
import { AppError } from "@/lib/errors";
import {
  clearActiveLocationCookie,
  clearDemoUserCookie,
  deviceCookieName,
  sessionCookieName,
  setDeviceCookie,
  setSessionCookie,
} from "./cookies";
import { DEVICE_COOKIE_MAX_AGE_S } from "./policy";
import { listOperators, loginWithPin, type OperatorOption } from "./pos-login";
import { redeemPairingCode } from "./pos-devices";
import { revokeSessionByToken } from "./sessions";
import { requireAccess } from "./session";
import { changePassword, loginWithPassword } from "./web-login";

// Flujos con cookies de Next (Server Actions): envuelven los servicios de este módulo, que no conocen las cookies.

/** Antes de abrir una sesión nueva se cierra la anterior del navegador (el token se rota en cada ingreso). */
async function dropPreviousSession(): Promise<void> {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (token) await revokeSessionByToken(token);
  await clearActiveLocationCookie();
  await clearDemoUserCookie();
}

/** Email + contraseña (administradora). Devuelve si debe cambiar la contraseña temporal antes de seguir. */
export async function signInWithPassword(input: { email: string; password: string }): Promise<{ mustChangePassword: boolean }> {
  const result = await loginWithPassword(input);
  await dropPreviousSession();
  await setSessionCookie(result.session.token, result.session.maxAgeSeconds);
  return { mustChangePassword: result.mustChangePassword };
}

/** PIN de una vendedora en el equipo vinculado (la cookie del dispositivo identifica la tienda). */
export async function signInWithPin(input: { userId: string; pin: string }): Promise<void> {
  const deviceToken = (await cookies()).get(deviceCookieName())?.value;
  const result = await loginWithPin({ deviceToken, userId: input.userId, pin: input.pin });
  await dropPreviousSession();
  await setSessionCookie(result.session.token, result.session.maxAgeSeconds);
}

/** Canjea el código de vinculación en este navegador: queda la cookie del dispositivo (httpOnly, 180 días). */
export async function linkThisDevice(input: { code: string }): Promise<void> {
  const linked = await redeemPairingCode({ code: input.code });
  await setDeviceCookie(linked.token, DEVICE_COOKIE_MAX_AGE_S);
}

/** Dispositivo vinculado de este navegador y las vendedoras que pueden entrar en él, o null si no está vinculado. */
export async function getDeviceLogin(): Promise<{ deviceName: string; locationName: string; operators: OperatorOption[] } | null> {
  const token = (await cookies()).get(deviceCookieName())?.value;
  const found = await listOperators(token);
  return found ? { deviceName: found.device.name, locationName: found.device.locationName, operators: found.operators } : null;
}

/** Cambio de contraseña de quien tiene la sesión (también el cambio forzado de la contraseña temporal). */
export async function changeOwnPassword(input: { current: string; next: string }): Promise<void> {
  const user = await requireAccess({ roles: ["ADMIN", "BODEGA"] }, { allowPasswordChange: true });
  if (user.sessionKind !== "WEB" || !user.sessionId) throw new AppError("FORBIDDEN", "Inicia sesión con tu email y contraseña para cambiarla.");
  await changePassword({ userId: user.id, sessionId: user.sessionId, current: input.current, next: input.next });
}
