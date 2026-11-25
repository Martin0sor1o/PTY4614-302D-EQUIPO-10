import { cookies } from "next/headers";

// Cookies de autenticación. En producción (`next start`, NODE_ENV=production) son Secure y llevan el prefijo __Host-
// (el navegador exige Secure, Path=/ y ningún Domain). En desarrollo por HTTP (`next dev`) van sin prefijo ni Secure,
// porque ahí el navegador no las aceptaría. Todas son httpOnly: el JavaScript de la página no puede leerlas.

function secure(): boolean {
  return process.env.NODE_ENV === "production";
}

const name = (base: string) => (secure() ? `__Host-${base}` : base);

export const sessionCookieName = () => name("bc_session");
export const deviceCookieName = () => name("bc_device");
export const activeLocationCookieName = () => name("bc_location");

/** DEMO: cookie del login sin contraseña ("Entrar como…"). Solo se lee con DEMO_MODE=true. */
export const DEMO_USER_COOKIE = "demo_user_id";

/** Lector mínimo de cookies: lo cumplen `cookies()` de Next y los dobles de los tests. */
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

function options(maxAgeSeconds: number) {
  return { httpOnly: true, secure: secure(), sameSite: "lax" as const, path: "/", maxAge: maxAgeSeconds };
}

/**
 * Borra una cookie SOBRESCRIBIÉNDOLA con las mismas opciones con las que se creó y `Max-Age=0`.
 * No se usa `cookies().delete()`: emite `Path=/; Expires=1970` sin `Secure` ni `HttpOnly`, y el navegador rechaza esa
 * respuesta para las cookies con prefijo `__Host-` (exigen `Secure` y `Path=/`), así que la cookie no se borraba.
 */
async function expire(name: string): Promise<void> {
  (await cookies()).set(name, "", options(0));
}

export async function setSessionCookie(token: string, maxAgeSeconds: number): Promise<void> {
  (await cookies()).set(sessionCookieName(), token, options(maxAgeSeconds));
}

export async function clearSessionCookie(): Promise<void> {
  await expire(sessionCookieName());
}

export async function setDeviceCookie(token: string, maxAgeSeconds: number): Promise<void> {
  (await cookies()).set(deviceCookieName(), token, options(maxAgeSeconds));
}

export async function setActiveLocationCookie(locationId: string): Promise<void> {
  // Sin maxAge: dura lo que el navegador; la ubicación se revalida en cada petición (solo ADMIN, ubicación activa).
  (await cookies()).set(activeLocationCookieName(), locationId, { httpOnly: true, secure: secure(), sameSite: "lax", path: "/" });
}

export async function clearActiveLocationCookie(): Promise<void> {
  await expire(activeLocationCookieName());
}

export async function setDemoUserCookie(userId: string): Promise<void> {
  (await cookies()).set(DEMO_USER_COOKIE, userId, options(60 * 60 * 12));
}

export async function clearDemoUserCookie(): Promise<void> {
  await expire(DEMO_USER_COOKIE);
}
