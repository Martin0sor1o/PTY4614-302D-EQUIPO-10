import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createSession, loginWithPassword, purgeAuthData } from "@/modules/auth";
import { resetDemo, type Fixtures } from "./helpers";
import { createWebUser, linkDevice, sessionRow } from "./auth-helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const daysAgo = (n: number) => `now() - interval '${n} days'`;

describe("pnpm auth:purge (excepción acotada a la regla de no borrado físico)", () => {
  it("borra sesiones vencidas o revocadas hace más de 30 días y conserva las vigentes y las recientes", async () => {
    const u = await createWebUser();
    const make = async () => (await sessionRow((await createSession({ userId: u.id, kind: "WEB" })).token)).id;
    const old = { expired: await make(), revoked: await make() };
    const recent = { expired: await make(), revoked: await make() };
    const active = await make();

    await db.$executeRawUnsafe(`UPDATE sessions SET created_at = ${daysAgo(60)}, expires_at = ${daysAgo(40)} WHERE id = '${old.expired}'`);
    await db.$executeRawUnsafe(`UPDATE sessions SET revoked_at = ${daysAgo(31)} WHERE id = '${old.revoked}'`);
    await db.$executeRawUnsafe(`UPDATE sessions SET created_at = ${daysAgo(10)}, expires_at = ${daysAgo(5)} WHERE id = '${recent.expired}'`);
    await db.$executeRawUnsafe(`UPDATE sessions SET revoked_at = ${daysAgo(2)} WHERE id = '${recent.revoked}'`);

    const result = await purgeAuthData(30);
    expect(result.sessions).toBe(2);
    const left = (await db.session.findMany()).map((s) => s.id).sort();
    expect(left).toEqual([recent.expired, recent.revoked, active].sort());
  });

  it("borra contadores de intentos viejos, pero no los recientes ni los que siguen bloqueados", async () => {
    await db.authThrottle.createMany({
      data: [
        { key: "login:viejo", failedAttempts: 2 },
        { key: "login:reciente", failedAttempts: 2 },
        { key: "login:bloqueado-viejo", failedAttempts: 5 },
      ],
    });
    await db.$executeRawUnsafe(`UPDATE auth_throttles SET updated_at = ${daysAgo(45)} WHERE key IN ('login:viejo', 'login:bloqueado-viejo')`);
    await db.$executeRawUnsafe(`UPDATE auth_throttles SET locked_until = now() + interval '5 minutes' WHERE key = 'login:bloqueado-viejo'`);

    const result = await purgeAuthData(30);
    expect(result.throttles).toBe(1);
    expect((await db.authThrottle.findMany()).map((t) => t.key).sort()).toEqual(["login:bloqueado-viejo", "login:reciente"]);
  });

  it("no toca usuarios, dispositivos ni auditoría", async () => {
    const u = await createWebUser();
    await loginWithPassword({ email: u.email, password: u.password });
    const { deviceId } = await linkDevice(f);
    await db.$executeRawUnsafe(`UPDATE users SET created_at = ${daysAgo(400)}, updated_at = ${daysAgo(400)}`);
    await db.$executeRawUnsafe(`UPDATE pos_devices SET created_at = ${daysAgo(400)}`);
    const before = { users: await db.user.count(), devices: await db.posDevice.count(), audit: await db.auditLog.count() };
    await purgeAuthData(1);
    expect({ users: await db.user.count(), devices: await db.posDevice.count(), audit: await db.auditLog.count() }).toEqual(before);
    expect((await db.posDevice.findUniqueOrThrow({ where: { id: deviceId } })).active).toBe(true);
  });

  it("valida el número de días", async () => {
    for (const days of [0, -1, 1.5, 4000, Number.NaN]) await expect(purgeAuthData(days)).rejects.toThrow(/entero entre 1 y 3650/);
  });

  it("sin nada que borrar devuelve ceros", async () => {
    expect(await purgeAuthData()).toEqual({ sessions: 0, throttles: 0 });
  });
});
