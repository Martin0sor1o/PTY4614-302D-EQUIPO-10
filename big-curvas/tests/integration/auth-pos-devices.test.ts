import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createPairingCode, listDevices, loginWithPin, redeemPairingCode, resolveDevice, resolveUser, revokeDevice } from "@/modules/auth";
import { createExtraStore, expectAppError, resetDemo, type Fixtures } from "./helpers";
import { auditDump, jar, linkDevice, SESSION_COOKIE, setPinFor, sha256 } from "./auth-helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const CODE_FAILURE = /Código inválido o vencido/;
const pair = (locationId = f.loc.TIENDA_RANCAGUA, name = "Caja Tienda Rancagua") => createPairingCode({ actor: f.actors.belen, locationId, name });

describe("generar el código de vinculación (solo ADMIN)", () => {
  it("la administradora obtiene un código de 8 caracteres que vence en 10 minutos; en la BD solo queda su HMAC", async () => {
    const created = await pair();
    expect(created.code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    const minutes = (created.expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(9);
    expect(minutes).toBeLessThanOrEqual(10);

    const row = await db.posDevice.findUniqueOrThrow({ where: { id: created.deviceId } });
    expect(row).toMatchObject({ locationId: f.loc.TIENDA_RANCAGUA, name: "Caja Tienda Rancagua", active: true, deviceTokenHash: null, registeredBy: f.actors.belen.id });
    expect(row.pairingCodeHash).toMatch(/^[0-9a-f]{64}$/);
    const raw = created.code.replace("-", "");
    expect(JSON.stringify(row)).not.toContain(raw);
    expect(await auditDump()).not.toContain(raw);
    expect(await db.auditLog.count({ where: { action: "POS_DEVICE_PAIRING_CREATED", userId: f.actors.belen.id } })).toBe(1);
  });

  it("la vendedora y bodega no pueden generar códigos, listar ni revocar (acceso)", async () => {
    for (const actor of [f.actors.vendRga, f.actors.bodega]) {
      await expectAppError(createPairingCode({ actor, locationId: f.loc.TIENDA_RANCAGUA, name: "Intruso" }), "FORBIDDEN", /rol/);
      await expectAppError(listDevices(actor), "FORBIDDEN");
      await expectAppError(revokeDevice({ actor, deviceId: "x" }), "FORBIDDEN");
    }
    expect(await db.posDevice.count()).toBe(0);
  });

  it("solo tiendas que venden en el POS (no la bodega ni ubicaciones inexistentes) y con nombre", async () => {
    await expectAppError(pair(f.loc.BODEGA), "NOT_FOUND", /tienda/);
    await expectAppError(pair("no-existe"), "NOT_FOUND");
    await expectAppError(pair(f.loc.TIENDA_RANCAGUA, "x"), "VALIDATION", /nombre/);
    await db.location.update({ where: { id: f.loc.TIENDA_RANCAGUA }, data: { active: false } });
    await expectAppError(pair(), "NOT_FOUND");
  });
});

describe("canjear el código en el equipo", () => {
  it("vincula el equipo: entrega un token, guarda solo su SHA-256 y deja el código sin uso", async () => {
    const created = await pair();
    const linked = await redeemPairingCode({ code: created.code });
    expect(linked.locationId).toBe(f.loc.TIENDA_RANCAGUA);
    expect(linked.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const row = await db.posDevice.findUniqueOrThrow({ where: { id: created.deviceId } });
    expect(row.deviceTokenHash).toBe(sha256(linked.token));
    expect(row.pairingCodeHash).toBeNull();
    expect(row.pairingExpiresAt).toBeNull();
    expect(row.pairedAt).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain(linked.token);
    expect(await auditDump()).not.toContain(linked.token);
    expect(await db.auditLog.count({ where: { action: "POS_DEVICE_LINKED", entityId: created.deviceId } })).toBe(1);
    expect(await resolveDevice(linked.token)).toMatchObject({ id: created.deviceId, locationId: f.loc.TIENDA_RANCAGUA, locationName: "Tienda Rancagua" });
  });

  it("acepta el código escrito con minúsculas, espacios o sin guion", async () => {
    const created = await pair();
    const typed = ` ${created.code.toLowerCase().replace("-", " ")} `;
    await expect(redeemPairingCode({ code: typed })).resolves.toMatchObject({ deviceId: created.deviceId });
  });

  it("un código sirve una sola vez", async () => {
    const created = await pair();
    await redeemPairingCode({ code: created.code });
    await expectAppError(redeemPairingCode({ code: created.code }), "VALIDATION", CODE_FAILURE);
  });

  it("un código vencido no sirve", async () => {
    const created = await pair();
    await db.$executeRaw`UPDATE pos_devices SET pairing_expires_at = now() - interval '1 minute' WHERE id = ${created.deviceId}`;
    await expectAppError(redeemPairingCode({ code: created.code }), "VALIDATION", CODE_FAILURE);
    const [row] = await listDevices(f.actors.belen);
    expect(row.status).toBe("CODIGO_VENCIDO");
  });

  it("dos canjes simultáneos del mismo código: solo uno gana", async () => {
    const created = await pair();
    const results = await Promise.allSettled([redeemPairingCode({ code: created.code }), redeemPairingCode({ code: created.code }), redeemPairingCode({ code: created.code })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(2);
    expect(await db.auditLog.count({ where: { action: "POS_DEVICE_LINKED" } })).toBe(1);
  });

  it("códigos equivocados cuentan: a los 10 fallos se bloquea el canje, incluso con un código bueno", async () => {
    const created = await pair();
    for (let i = 1; i <= 9; i++) await expectAppError(redeemPairingCode({ code: "ZZZZZZZZ" }), "VALIDATION", CODE_FAILURE);
    await expectAppError(redeemPairingCode({ code: "no es un código" }), "VALIDATION", CODE_FAILURE); // 10.º
    await expectAppError(redeemPairingCode({ code: created.code }), "FORBIDDEN", /Demasiados intentos/);
    expect(await db.posDevice.count({ where: { deviceTokenHash: { not: null } } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "POS_DEVICE_PAIRING_FAILED" } })).toBe(10);
  });

  it("un dispositivo revocado antes de canjear ya no se puede vincular", async () => {
    const created = await pair();
    await revokeDevice({ actor: f.actors.belen, deviceId: created.deviceId });
    await expectAppError(redeemPairingCode({ code: created.code }), "VALIDATION", CODE_FAILURE);
  });
});

describe("revocar un dispositivo (solo ADMIN)", () => {
  it("deja de servir, queda con fecha y quién lo revocó, y cierra al instante sus sesiones de caja", async () => {
    const { deviceId, token } = await linkDevice(f);
    const vend = f.actors.vendRga;
    const pin = await setPinFor(f, vend.id);
    const { session } = await loginWithPin({ deviceToken: token, userId: vend.id, pin });
    expect(await resolveUser(jar({ [SESSION_COOKIE]: session.token }))).not.toBeNull();

    const { sessionsRevoked } = await revokeDevice({ actor: f.actors.belen, deviceId });
    expect(sessionsRevoked).toBe(1);
    expect(await resolveUser(jar({ [SESSION_COOKIE]: session.token }))).toBeNull(); // la caja se cortó al instante
    expect(await resolveDevice(token)).toBeNull();

    const row = await db.posDevice.findUniqueOrThrow({ where: { id: deviceId } });
    expect(row).toMatchObject({ active: false, revokedBy: f.actors.belen.id });
    expect(row.revokedAt).not.toBeNull();
    expect(await db.auditLog.count({ where: { action: "POS_DEVICE_REVOKED", entityId: deviceId } })).toBe(1);
    // No se borra: queda para la historia.
    expect(await db.posDevice.count()).toBe(1);
  });

  it("revocar dos veces o un dispositivo inexistente es NOT_FOUND", async () => {
    const { deviceId } = await linkDevice(f);
    await revokeDevice({ actor: f.actors.belen, deviceId });
    await expectAppError(revokeDevice({ actor: f.actors.belen, deviceId }), "NOT_FOUND");
    await expectAppError(revokeDevice({ actor: f.actors.belen, deviceId: "no-existe" }), "NOT_FOUND");
  });

  it("la lista muestra el estado de cada equipo", async () => {
    const pending = await pair(f.loc.TIENDA_RANCAGUA, "Pendiente");
    const linked = await linkDevice(f, f.loc.TIENDA_RANCAGUA, "Vinculada");
    const revoked = await linkDevice(f, f.loc.TIENDA_RANCAGUA, "Revocada");
    await revokeDevice({ actor: f.actors.belen, deviceId: revoked.deviceId });
    const byName = Object.fromEntries((await listDevices(f.actors.belen)).map((d) => [d.name, d.status]));
    expect(byName).toEqual({ Pendiente: "PENDIENTE", Vinculada: "VINCULADO", Revocada: "REVOCADO" });
    expect(pending.deviceId).not.toBe(linked.deviceId);
  });
});

describe("dispositivo ligado a UNA tienda", () => {
  it("el equipo de una tienda no sirve para vendedoras de otra", async () => {
    const otra = await createExtraStore();
    const { token } = await linkDevice(f, otra.id, "Caja Tienda Extra");
    const vend = f.actors.vendRga; // vendedora de Rancagua
    const pin = await setPinFor(f, vend.id);
    await expectAppError(loginWithPin({ deviceToken: token, userId: vend.id, pin }), "VALIDATION", /PIN incorrecto/);
    expect(await db.session.count()).toBe(0);
  });
});
