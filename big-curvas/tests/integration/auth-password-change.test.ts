import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { verifySecret } from "@/lib/scrypt-hash";
import { changePassword, loginWithPassword } from "@/modules/auth";
import { expectAppError, resetDemo } from "./helpers";
import { auditDump, createWebUser, randomPassword, sessionRow } from "./auth-helpers";

beforeEach(async () => {
  await resetDemo();
});

async function setup(opts: { mustChange?: boolean } = {}) {
  const u = await createWebUser({ mustChange: opts.mustChange, name: "Belén de prueba" });
  const { session } = await loginWithPassword({ email: u.email, password: u.password });
  const row = await sessionRow(session.token);
  return { u, sessionId: row.id };
}

describe("cambio de contraseña", () => {
  it("cambia la contraseña: la nueva sirve para entrar y la vieja ya no; la auditoría no guarda ninguna", async () => {
    const { u, sessionId } = await setup();
    const next = randomPassword();
    await changePassword({ userId: u.id, sessionId, current: u.password, next });

    const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(user.passwordChangedAt).not.toBeNull();
    expect(await verifySecret(next, user.passwordHash!)).toBe(true);
    await expect(loginWithPassword({ email: u.email, password: next })).resolves.toBeDefined();
    await expectAppError(loginWithPassword({ email: u.email, password: u.password }), "UNAUTHENTICATED", /incorrectos/);

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "AUTH_PASSWORD_CHANGED" } });
    expect(audit).toMatchObject({ userId: u.id, entity: "user", entityId: u.id });
    const dump = await auditDump();
    expect(dump).not.toContain(next);
    expect(dump).not.toContain(u.password);
  });

  it("el cambio forzado de la contraseña temporal quita la marca", async () => {
    const { u, sessionId } = await setup({ mustChange: true });
    await changePassword({ userId: u.id, sessionId, current: u.password, next: randomPassword() });
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).mustChangePassword).toBe(false);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "AUTH_PASSWORD_CHANGED" } });
    expect(audit.after).toMatchObject({ forced: true });
  });

  it("exige la contraseña actual correcta", async () => {
    const { u, sessionId } = await setup();
    await expectAppError(changePassword({ userId: u.id, sessionId, current: "no-es-esta", next: randomPassword() }), "VALIDATION", /actual no es correcta/);
    const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(await verifySecret(u.password, user.passwordHash!)).toBe(true); // no se cambió
  });

  it("aplica la política a la nueva contraseña y exige que sea distinta de la actual", async () => {
    const { u, sessionId } = await setup();
    await expectAppError(changePassword({ userId: u.id, sessionId, current: u.password, next: "corta" }), "VALIDATION", /al menos 12/);
    await expectAppError(changePassword({ userId: u.id, sessionId, current: u.password, next: "contraseña1234" }), "VALIDATION", /común/);
    await expectAppError(changePassword({ userId: u.id, sessionId, current: u.password, next: u.password }), "VALIDATION", /distinta/);
    await expectAppError(changePassword({ userId: u.id, sessionId, current: u.password, next: u.email }), "VALIDATION", /email o a tu nombre/);
  });

  it("adivinar la contraseña actual también se bloquea tras 5 intentos (por usuario)", async () => {
    const { u, sessionId } = await setup();
    for (let i = 1; i <= 4; i++) await expectAppError(changePassword({ userId: u.id, sessionId, current: "mala", next: randomPassword() }), "VALIDATION", /actual no es correcta/);
    await expectAppError(changePassword({ userId: u.id, sessionId, current: "mala", next: randomPassword() }), "FORBIDDEN", /Demasiados intentos/);
    // Bloqueado: ni siquiera con la contraseña correcta.
    await expectAppError(changePassword({ userId: u.id, sessionId, current: u.password, next: randomPassword() }), "FORBIDDEN", /Demasiados intentos/);
    const throttle = await db.authThrottle.findFirstOrThrow({ where: { key: { startsWith: "pwchange:" } } });
    expect(throttle.key).not.toContain(u.id); // la clave es un HMAC, no el id
  });

  it("solo cuentas con contraseña (ADMIN o BODEGA) activas pueden cambiarla", async () => {
    const f = await resetDemo();
    await expectAppError(changePassword({ userId: f.actors.vendRga.id, sessionId: "x", current: "a", next: randomPassword() }), "FORBIDDEN", /no tiene contraseña/);
    const { u, sessionId } = await setup();
    await db.user.update({ where: { id: u.id }, data: { active: false } });
    await expectAppError(changePassword({ userId: u.id, sessionId, current: u.password, next: randomPassword() }), "FORBIDDEN");
  });
});
