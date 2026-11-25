import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { loginWithPassword, logout } from "@/modules/auth";
import { createWebUser, SESSION_COOKIE } from "./auth-helpers";
import { resetDemo } from "./helpers";

// Cookies de verdad: el almacén simulado es el `ResponseCookies` real de Next (el de una respuesta), así que se lee el
// mismo encabezado Set-Cookie que recibiría el navegador. Los nombres con prefijo __Host- exigen Secure y Path=/ también
// al BORRAR: una respuesta de borrado sin Secure es rechazada por el navegador y la cookie queda puesta.

const mocks = vi.hoisted(() => ({ response: null as unknown as { cookies: unknown; headers: Headers } }));
vi.mock("next/headers", () => ({ cookies: async () => mocks.response.cookies }));

type Store = { set(name: string, value: string, options?: Record<string, unknown>): void };
const store = () => mocks.response.cookies as Store;
const setCookies = () => mocks.response.headers.getSetCookie();
const header = (name: string) => setCookies().find((h) => h.startsWith(`${name}=`));

beforeEach(async () => {
  mocks.response = new NextResponse();
  await resetDemo();
});
afterEach(() => vi.unstubAllEnvs());

async function sessionAndLocation(name: string, locationName: string) {
  // Una sesión real y la cookie de ubicación, para que el cierre de sesión tenga qué borrar.
  const u = await createWebUser();
  const { session } = await loginWithPassword({ email: u.email, password: u.password });
  store().set(name, session.token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  store().set(locationName, "una-ubicacion", { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  store().set("demo_user_id", "un-usuario", { httpOnly: true, path: "/" });
}

describe("borrado de cookies al cerrar sesión", () => {
  it("producción: cada cookie se borra con Secure, HttpOnly, SameSite, Path=/ y Max-Age=0 (aceptable para __Host-)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await sessionAndLocation("__Host-bc_session", "__Host-bc_location");
    await logout();

    for (const name of ["__Host-bc_session", "__Host-bc_location", "demo_user_id"]) {
      const h = header(name);
      expect(h, `Set-Cookie de ${name}`).toBeDefined();
      expect(h).toMatch(new RegExp(`^${name}=;`)); // valor vacío
      expect(h).toContain("Path=/");
      expect(h).toContain("Max-Age=0");
      expect(h).toContain("Secure");
      expect(h).toContain("HttpOnly");
      expect(h).toMatch(/SameSite=lax/i);
      expect(h).not.toMatch(/Domain=/i); // __Host- prohíbe Domain
    }
    // Una sola respuesta por cookie: la de borrado reemplaza a la que la creó (no queda una versión con valor).
    expect(setCookies().filter((h) => h.startsWith("__Host-bc_session="))).toHaveLength(1);
  });

  it("producción: el borrado no toca la cookie del dispositivo POS (el equipo sigue vinculado)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await sessionAndLocation("__Host-bc_session", "__Host-bc_location");
    store().set("__Host-bc_device", "token-del-equipo", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 1000 });
    await logout();
    const device = header("__Host-bc_device");
    expect(device).toContain("token-del-equipo");
    expect(device).not.toContain("Max-Age=0");
  });

  it("desarrollo (HTTP): se borran con Max-Age=0 y sin Secure ni prefijo, para que el navegador las acepte", async () => {
    await sessionAndLocation(SESSION_COOKIE, "bc_location");
    await logout();
    for (const name of ["bc_session", "bc_location", "demo_user_id"]) {
      const h = header(name);
      expect(h, `Set-Cookie de ${name}`).toBeDefined();
      expect(h).toContain("Max-Age=0");
      expect(h).toContain("Path=/");
      expect(h).toContain("HttpOnly");
      expect(h).not.toContain("Secure");
    }
  });

  it("una sesión borrada deja de servir aunque el navegador conserve la cookie (la revocación es en la BD)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await sessionAndLocation("__Host-bc_session", "__Host-bc_location");
    const token = (mocks.response.cookies as unknown as { get(n: string): { value: string } | undefined }).get("__Host-bc_session")!.value;
    await logout();
    const { resolveUser } = await import("@/modules/auth");
    expect(await resolveUser({ get: (n) => (n === "__Host-bc_session" ? { value: token } : undefined) })).toBeNull();
  });
});
