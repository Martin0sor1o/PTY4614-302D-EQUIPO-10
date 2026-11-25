import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashSecret, verifySecret } from "@/lib/scrypt-hash";
import { createAdminAccount, loginWithPassword, resetPasswordAccount, resolveUser } from "@/modules/auth";
import { expectAppError, resetDemo, type Fixtures } from "./helpers";
import { auditDump, createWebUser, jar, randomPassword, sessionRow, SESSION_COOKIE, sha256 } from "./auth-helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const GENERIC = /Email o contraseña incorrectos/;
const LOCKED = /Demasiados intentos/;

describe("alta de la administradora inicial (script)", () => {
  it("crea un ADMIN con contraseña temporal hasheada y cambio forzado; la auditoría no guarda secretos", async () => {
    const password = randomPassword();
    const { userId } = await createAdminAccount({ email: "  Belen@Auth.TEST ", name: "Belén de prueba", password });
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ role: "ADMIN", email: "belen@auth.test", mustChangePassword: true, active: true, locationId: null });
    expect(user.passwordHash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(user.passwordHash).not.toContain(password);
    expect(await verifySecret(password, user.passwordHash!)).toBe(true);

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "AUTH_ADMIN_CREATED" } });
    expect(audit).toMatchObject({ entity: "user", entityId: userId, userId: null });
    const dump = await auditDump();
    expect(dump).not.toContain(password);
    expect(dump).not.toContain("belen@auth.test");
  });

  it("rechaza contraseñas que no cumplen la política, emails inválidos y duplicados", async () => {
    await expectAppError(createAdminAccount({ email: "a@auth.test", name: "Admin", password: "corta" }), "VALIDATION", /al menos 12/);
    await expectAppError(createAdminAccount({ email: "a@auth.test", name: "Admin", password: "contraseña1234" }), "VALIDATION", /común/);
    await expectAppError(createAdminAccount({ email: "sin-arroba", name: "Admin", password: randomPassword() }), "VALIDATION", /email/);
    await expectAppError(createAdminAccount({ email: "a@auth.test", name: "A", password: randomPassword() }), "VALIDATION", /nombre/);
    await createAdminAccount({ email: "dup@auth.test", name: "Admin", password: randomPassword() });
    await expectAppError(createAdminAccount({ email: "DUP@auth.test", name: "Otra", password: randomPassword() }), "CONFLICT", /Ya existe/);
  });

  it("reinicio por script: contraseña temporal nueva, cambio forzado, sesiones cerradas y bloqueo levantado", async () => {
    const u = await createWebUser();
    const { session } = await loginWithPassword({ email: u.email, password: u.password });
    for (let i = 0; i < 5; i++) await loginWithPassword({ email: u.email, password: "no-es-esta-clave" }).catch(() => undefined);
    await expectAppError(loginWithPassword({ email: u.email, password: u.password }), "FORBIDDEN", LOCKED);

    const temp = randomPassword();
    await resetPasswordAccount({ email: u.email, password: temp });
    expect(await resolveUser(jar({ [SESSION_COOKIE]: session.token }))).toBeNull(); // la sesión anterior se cerró
    const again = await loginWithPassword({ email: u.email, password: temp });
    expect(again.mustChangePassword).toBe(true);
    await expectAppError(loginWithPassword({ email: u.email, password: u.password }), "UNAUTHENTICATED", GENERIC); // la vieja ya no sirve
    expect(await db.auditLog.count({ where: { action: "AUTH_PASSWORD_RESET" } })).toBe(1);
    await expectAppError(resetPasswordAccount({ email: "nadie@auth.test", password: temp }), "NOT_FOUND");
  });
});

describe("login con email y contraseña", () => {
  it("correcto: abre una sesión web; en la BD solo queda el hash del token", async () => {
    const u = await createWebUser({ name: "Belén de prueba" });
    const result = await loginWithPassword({ email: u.email.toUpperCase(), password: u.password }); // el email no distingue mayúsculas
    expect(result.userId).toBe(u.id);
    expect(result.mustChangePassword).toBe(false);

    const row = await sessionRow(result.session.token);
    expect(row).toMatchObject({ userId: u.id, kind: "WEB", posDeviceId: null, revokedAt: null });
    expect(row.tokenHash).toBe(sha256(result.session.token));
    expect(row.tokenHash).not.toContain(result.session.token);
    expect(result.session.maxAgeSeconds).toBe(7 * 24 * 60 * 60);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).lastLoginAt).not.toBeNull();

    const user = await resolveUser(jar({ [SESSION_COOKIE]: result.session.token }));
    expect(user).toMatchObject({ id: u.id, role: "ADMIN", sessionKind: "WEB", mustChangePassword: false, location: null, activeLocation: null });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "AUTH_LOGIN", userId: u.id } });
    expect(audit.after).toMatchObject({ method: "PASSWORD" });
  });

  it("con contraseña temporal el login funciona pero la sesión lo indica", async () => {
    const u = await createWebUser({ mustChange: true });
    const r = await loginWithPassword({ email: u.email, password: u.password });
    expect(r.mustChangePassword).toBe(true);
    expect((await resolveUser(jar({ [SESSION_COOKIE]: r.session.token })))?.mustChangePassword).toBe(true);
  });

  it("incorrecto: el mensaje es el mismo para contraseña mala, email inexistente, usuario inactivo, vendedora y cuenta sin contraseña", async () => {
    const u = await createWebUser();
    const inactive = await createWebUser();
    await db.user.update({ where: { id: inactive.id }, data: { active: false } });
    const noPassword = await createWebUser();
    await db.user.update({ where: { id: noPassword.id }, data: { passwordHash: null } });
    // La vendedora de la demo tiene email pero NO entra por la vía web.
    const vend = await createWebUser({ role: "BODEGA", locationId: f.loc.BODEGA });
    await db.user.update({ where: { id: vend.id }, data: { role: "VENDEDORA", locationId: f.loc.TIENDA_RANCAGUA } });

    const attempts = [
      { email: u.email, password: "no-es-esta-clave" },
      { email: "nadie@auth.test", password: u.password },
      { email: inactive.email, password: inactive.password },
      { email: noPassword.email, password: "cualquiera" },
      { email: vend.email, password: vend.password },
      { email: "", password: "" },
      { email: "no es un email", password: "x" },
    ];
    for (const a of attempts) {
      const error = await expectAppError(loginWithPassword(a), "UNAUTHENTICATED", GENERIC);
      expect(error.message).toBe("Email o contraseña incorrectos.");
    }
  });

  it("registra los fallos en la auditoría sin guardar el email ni la contraseña escrita", async () => {
    const typed = randomPassword();
    await loginWithPassword({ email: "alguien.raro@auth.test", password: typed }).catch(() => undefined);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "AUTH_LOGIN_FAILED" } });
    expect(audit.userId).toBeNull();
    expect(audit.after).toMatchObject({ attempts: 1 });
    expect((audit.after as { emailFp: string }).emailFp).toMatch(/^[0-9a-f]{16}$/);
    const dump = await auditDump();
    expect(dump).not.toContain(typed);
    expect(dump).not.toContain("alguien.raro");
  });

  it("5 fallos bloquean 15 minutos, incluso con la contraseña correcta; la 5.ª ya responde 'bloqueado'", async () => {
    const u = await createWebUser();
    for (let i = 1; i <= 4; i++) await expectAppError(loginWithPassword({ email: u.email, password: "mala" }), "UNAUTHENTICATED", GENERIC);
    await expectAppError(loginWithPassword({ email: u.email, password: "mala" }), "FORBIDDEN", LOCKED);
    await expectAppError(loginWithPassword({ email: u.email, password: u.password }), "FORBIDDEN", LOCKED);

    const locked = await db.auditLog.findMany({ where: { action: "AUTH_LOCKED" } });
    expect(locked).toHaveLength(1);
    expect(locked[0].userId).toBe(u.id);
    const throttle = await db.authThrottle.findMany();
    expect(throttle).toHaveLength(1);
    expect(throttle[0].key).toMatch(/^login:[0-9a-f]{64}$/); // clave HMAC: no contiene el email
    expect(throttle[0].key).not.toContain("auth.test");
    const minutes = (throttle[0].lockedUntil!.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);
  });

  it("un email que NO existe se bloquea igual (no se puede averiguar qué cuentas existen)", async () => {
    const real = await createWebUser();
    const outcome = async (email: string) => {
      const results: string[] = [];
      for (let i = 0; i < 6; i++) {
        results.push(await loginWithPassword({ email, password: "mala" }).then(() => "ok", (e: Error) => `${(e as unknown as { code: string }).code}:${e.message}`));
      }
      return results;
    };
    expect(await outcome("fantasma@auth.test")).toEqual(await outcome(real.email));
  });

  it("pasado el bloqueo, la contraseña correcta entra y el contador vuelve a cero", async () => {
    const u = await createWebUser();
    for (let i = 0; i < 5; i++) await loginWithPassword({ email: u.email, password: "mala" }).catch(() => undefined);
    await db.$executeRaw`UPDATE auth_throttles SET locked_until = now() - interval '1 minute'`; // el bloqueo ya terminó
    await expect(loginWithPassword({ email: u.email, password: u.password })).resolves.toBeDefined();
    const throttle = (await db.authThrottle.findMany())[0];
    expect(throttle).toMatchObject({ failedAttempts: 0, lockedUntil: null });
    // Tras el éxito hacen falta otros 5 fallos para bloquear (no se arrastran los anteriores).
    for (let i = 1; i <= 4; i++) await expectAppError(loginWithPassword({ email: u.email, password: "mala" }), "UNAUTHENTICATED", GENERIC);
  });

  it("un éxito intermedio reinicia los intentos", async () => {
    const u = await createWebUser();
    for (let i = 0; i < 3; i++) await loginWithPassword({ email: u.email, password: "mala" }).catch(() => undefined);
    await loginWithPassword({ email: u.email, password: u.password });
    for (let i = 1; i <= 4; i++) await expectAppError(loginWithPassword({ email: u.email, password: "mala" }), "UNAUTHENTICATED", GENERIC);
    await expect(loginWithPassword({ email: u.email, password: u.password })).resolves.toBeDefined();
  });

  it("si el costo del hash subió, el hash guardado se actualiza al entrar", async () => {
    const u = await createWebUser();
    // Hash con parámetros más débiles (N = 2^14): como el que quedaría tras subir el costo.
    const { scrypt, randomBytes } = await import("node:crypto");
    const salt = randomBytes(16);
    const key = await new Promise<Buffer>((resolve, reject) => scrypt(u.password.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? reject(e) : resolve(k))));
    const weak = `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
    await db.user.update({ where: { id: u.id }, data: { passwordHash: weak } });

    await loginWithPassword({ email: u.email, password: u.password });
    const after = (await db.user.findUniqueOrThrow({ where: { id: u.id } })).passwordHash!;
    expect(after).not.toBe(weak);
    expect(after.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifySecret(u.password, after)).toBe(true);
    expect(await verifySecret(u.password, await hashSecret("otra"))).toBe(false);
  });
});

// Las peticiones simultáneas contra el bloqueo (el intento se cuenta ANTES de verificar) están en auth-concurrency.test.ts.
// Aquí se quitó el test anterior "contador de intentos atómico": medía el modelo "revisar y luego contar el fallo", donde
// 12 peticiones a la vez podían verificar las 12 (se contaban todas, pero ninguna se frenaba). Ahora solo 5 llegan a verificar.
