import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { changePassword, createSession, loginWithPassword, resolveSession, resolveUser, revokeSessionByToken, revokeUserSessions } from "@/modules/auth";
import { resetDemo, type Fixtures } from "./helpers";
import { ageSession, createWebUser, jar, LOCATION_COOKIE, SESSION_COOKIE, sessionRow, sha256 } from "./auth-helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

async function webSession() {
  const u = await createWebUser();
  const { session } = await loginWithPassword({ email: u.email, password: u.password });
  return { u, token: session.token };
}
const asUser = (token: string, extra: Record<string, string> = {}) => resolveUser(jar({ [SESSION_COOKIE]: token, ...extra }));

describe("sesión: vigencia", () => {
  it("con el token de la cookie se resuelve el usuario; sin cookie, con basura o con un token desconocido, null", async () => {
    const { u, token } = await webSession();
    expect((await asUser(token))?.id).toBe(u.id);
    expect(await resolveUser(jar({}))).toBeNull();
    expect(await asUser("")).toBeNull();
    expect(await asUser("token-inventado")).toBeNull();
    expect(await asUser("x".repeat(300))).toBeNull();
    expect(await asUser(`${token}x`)).toBeNull(); // un solo carácter de más ya no sirve
  });

  it("sesión web: vence a las 12 h de inactividad (a las 11 h todavía sirve)", async () => {
    const { token } = await webSession();
    await ageSession(token, { idleMinutes: 11 * 60 });
    expect(await asUser(token)).not.toBeNull();
    await ageSession(token, { idleMinutes: 12 * 60 + 1 });
    expect(await asUser(token)).toBeNull();
  });

  it("sesión web: vence en forma absoluta (7 días) aunque haya actividad reciente", async () => {
    const { token } = await webSession();
    await ageSession(token, { expiredMinutes: 1 });
    expect(await asUser(token)).toBeNull();
    const row = await sessionRow(token);
    expect(row.revokedAt).toBeNull(); // venció sola: no hizo falta revocarla
  });

  it("la actividad se actualiza como mucho una vez por minuto", async () => {
    const { token } = await webSession();
    await db.$executeRaw`UPDATE sessions SET last_seen_at = now() - interval '10 seconds' WHERE token_hash = ${sha256(token)}`;
    const before = (await sessionRow(token)).lastSeenAt.getTime();
    await asUser(token);
    expect((await sessionRow(token)).lastSeenAt.getTime()).toBe(before); // 10 s: no se escribe
    await ageSession(token, { idleMinutes: 5 });
    await asUser(token);
    expect(Date.now() - (await sessionRow(token)).lastSeenAt.getTime()).toBeLessThan(60_000); // 5 min: se renovó
  });

  it("al desactivar al usuario su sesión deja de servir", async () => {
    const { u, token } = await webSession();
    await db.user.update({ where: { id: u.id }, data: { active: false } });
    expect(await asUser(token)).toBeNull();
  });

  it("una cuenta que dejó de tener contraseña, o que pasó a ser vendedora, no conserva la sesión web", async () => {
    const a = await webSession();
    await db.user.update({ where: { id: a.u.id }, data: { passwordHash: null } });
    expect(await asUser(a.token)).toBeNull();
    const b = await webSession();
    await db.user.update({ where: { id: b.u.id }, data: { role: "VENDEDORA", locationId: f.loc.TIENDA_RANCAGUA } });
    expect(await asUser(b.token)).toBeNull();
  });
});

describe("cerrar sesión y revocar", () => {
  it("revocar el token invalida la sesión al instante (y solo esa)", async () => {
    const a = await webSession();
    const b = await webSession();
    const revoked = await revokeSessionByToken(a.token);
    expect(revoked?.userId).toBe(a.u.id);
    expect(await asUser(a.token)).toBeNull();
    expect(await asUser(b.token)).not.toBeNull();
    expect((await sessionRow(a.token)).revokedAt).not.toBeNull();
    expect(await revokeSessionByToken(a.token)).toBeNull(); // ya estaba revocada
    expect(await revokeSessionByToken("desconocido")).toBeNull();
  });

  it("revocar todas las sesiones de un usuario, menos una", async () => {
    const u = await createWebUser();
    const s1 = await createSession({ userId: u.id, kind: "WEB" });
    const s2 = await createSession({ userId: u.id, kind: "WEB" });
    const s3 = await createSession({ userId: u.id, kind: "WEB" });
    const keep = await sessionRow(s2.token);
    expect(await revokeUserSessions(u.id, keep.id)).toBe(2);
    expect(await asUser(s1.token)).toBeNull();
    expect(await asUser(s2.token)).not.toBeNull();
    expect(await asUser(s3.token)).toBeNull();
    expect(await revokeUserSessions(u.id)).toBe(1);
    expect(await asUser(s2.token)).toBeNull();
  });

  it("cambiar la contraseña cierra las demás sesiones pero no la actual", async () => {
    const u = await createWebUser();
    const first = await loginWithPassword({ email: u.email, password: u.password });
    const second = await loginWithPassword({ email: u.email, password: u.password });
    const secondRow = await sessionRow(second.session.token);
    await changePassword({ userId: u.id, sessionId: secondRow.id, current: u.password, next: `${u.password} nueva` });
    expect(await asUser(first.session.token)).toBeNull();
    expect(await asUser(second.session.token)).not.toBeNull();
  });
});

describe("ubicación activa (ADMIN)", () => {
  it("la administradora opera donde elige; una ubicación inexistente o inactiva se ignora", async () => {
    const { token } = await webSession();
    expect((await asUser(token))?.activeLocation).toBeNull();
    expect((await asUser(token, { [LOCATION_COOKIE]: f.loc.BODEGA }))?.activeLocation).toMatchObject({ id: f.loc.BODEGA, code: "BODEGA" });
    expect((await asUser(token, { [LOCATION_COOKIE]: "no-existe" }))?.activeLocation).toBeNull();
    await db.location.update({ where: { id: f.loc.BODEGA }, data: { active: false } });
    expect((await asUser(token, { [LOCATION_COOKIE]: f.loc.BODEGA }))?.activeLocation).toBeNull();
  });

  it("bodega entra por la vía web y opera siempre en su ubicación (la cookie de ubicación no la cambia)", async () => {
    const u = await createWebUser({ role: "BODEGA", locationId: f.loc.BODEGA });
    const { session } = await loginWithPassword({ email: u.email, password: u.password });
    const user = await asUser(session.token, { [LOCATION_COOKIE]: f.loc.TIENDA_RANCAGUA });
    expect(user).toMatchObject({ role: "BODEGA", location: { code: "BODEGA" }, activeLocation: { code: "BODEGA" } });
  });
});

describe("resolveSession", () => {
  it("devuelve el tipo de sesión y no filtra el hash de la contraseña", async () => {
    const { token } = await webSession();
    const resolved = await resolveSession(token);
    expect(resolved?.kind).toBe("WEB");
    expect(resolved?.device).toBeNull();
    expect(JSON.stringify(resolved)).not.toMatch(/passwordHash|pinHash|scrypt/);
  });
});
