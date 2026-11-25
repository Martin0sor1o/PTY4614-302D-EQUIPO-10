import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { approveWithPin, hashPin, verifyPin } from "@/modules/approvals";
import {
  listOperators,
  listSalesTeam,
  loginWithPin,
  resolveUser,
  setOwnApprovalPin,
  setSalesPin,
  revokeDevice,
  type ResolvedSession,
  resolveSession,
} from "@/modules/auth";
import { createExtraStore, expectAppError, newKey, resetDemo, type Fixtures } from "./helpers";
import { openCaja, PBA_XL, requestDiscount } from "./approvals-helpers";
import { ageSession, auditDump, createWebUser, jar, linkDevice, otherPin, randomPassword, randomPin, SESSION_COOKIE, sessionRow, setPinFor } from "./auth-helpers";

let f: Fixtures;
let device: { deviceId: string; token: string };
beforeEach(async () => {
  f = await resetDemo();
  device = await linkDevice(f);
});

const vend = () => f.actors.vendRga;
const login = (userId: string, pin: string, token = device.token) => loginWithPin({ deviceToken: token, userId, pin });

describe("PIN de las vendedoras (lo define la administradora)", () => {
  it("el PIN se guarda hasheado y se verifica; la auditoría no lo guarda", async () => {
    const pin = await setPinFor(f, vend().id);
    const user = await db.user.findUniqueOrThrow({ where: { id: vend().id } });
    expect(user.pinHash).toMatch(/^scrypt\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(user.pinHash).not.toContain(pin);
    expect(verifyPin(pin, user.pinHash!)).toBe(true);
    expect(verifyPin(otherPin(pin), user.pinHash!)).toBe(false);
    expect(await db.auditLog.count({ where: { action: "POS_PIN_SET", entityId: vend().id, userId: f.actors.belen.id } })).toBe(1);
    expect(await auditDump()).not.toContain(pin);
  });

  it("solo una administradora lo define (la vendedora ni siquiera el suyo)", async () => {
    for (const actor of [f.actors.vendRga, f.actors.bodega]) {
      await expectAppError(setSalesPin({ actor, userId: f.actors.vendRga2.id, pin: randomPin() }), "FORBIDDEN", /rol/);
      await expectAppError(listSalesTeam(actor), "FORBIDDEN");
    }
  });

  it("aplica la política: exactamente 6 dígitos y nada trivial; solo a vendedoras activas", async () => {
    for (const pin of ["1234", "12345", "1234567", "abcdef", "111111", "123456", "987654"]) {
      await expectAppError(setSalesPin({ actor: f.actors.belen, userId: vend().id, pin }), "VALIDATION");
    }
    await expectAppError(setSalesPin({ actor: f.actors.belen, userId: f.actors.belen.id, pin: randomPin() }), "NOT_FOUND"); // no es vendedora
    await expectAppError(setSalesPin({ actor: f.actors.belen, userId: "no-existe", pin: randomPin() }), "NOT_FOUND");
    await db.user.update({ where: { id: vend().id }, data: { active: false } });
    await expectAppError(setSalesPin({ actor: f.actors.belen, userId: vend().id, pin: randomPin() }), "NOT_FOUND");
  });

  it("restablecer el PIN desbloquea a la vendedora y cierra sus sesiones de caja", async () => {
    const pin = await setPinFor(f, vend().id);
    const { session } = await login(vend().id, pin);
    for (let i = 0; i < 5; i++) await login(vend().id, otherPin(pin)).catch(() => undefined);
    await expectAppError(login(vend().id, pin), "FORBIDDEN", /bloqueado/);

    const fresh = await setPinFor(f, vend().id);
    expect(await resolveUser(jar({ [SESSION_COOKIE]: session.token }))).toBeNull();
    const user = await db.user.findUniqueOrThrow({ where: { id: vend().id } });
    expect(user).toMatchObject({ failedPinAttempts: 0, pinLockedUntil: null });
    await expect(login(vend().id, fresh)).resolves.toBeDefined();
  });

  it("la lista del equipo muestra quién tiene PIN y quién está bloqueada, sin hashes", async () => {
    const pin = await setPinFor(f, vend().id);
    for (let i = 0; i < 5; i++) await login(vend().id, otherPin(pin)).catch(() => undefined);
    const team = await listSalesTeam(f.actors.belen);
    const rga = team.find((m) => m.id === vend().id)!;
    const rga2 = team.find((m) => m.id === f.actors.vendRga2.id)!;
    expect(rga).toMatchObject({ name: "Vendedora Rancagua", locationName: "Tienda Rancagua", hasPin: true });
    expect(rga.pinLockedUntil).not.toBeNull();
    expect(rga2).toMatchObject({ hasPin: false, pinLockedUntil: null });
    expect(JSON.stringify(team)).not.toMatch(/scrypt/);
  });
});

describe("entrar a la caja con el PIN", () => {
  it("PIN correcto: sesión de caja ligada al dispositivo; la vendedora solo ve su tienda", async () => {
    const pin = await setPinFor(f, vend().id);
    const result = await login(vend().id, pin);
    expect(result).toMatchObject({ userId: vend().id, locationId: f.loc.TIENDA_RANCAGUA });
    expect(result.session.maxAgeSeconds).toBe(12 * 60 * 60);

    const row = await sessionRow(result.session.token);
    expect(row).toMatchObject({ kind: "POS", userId: vend().id, posDeviceId: device.deviceId });

    const user = await resolveUser(jar({ [SESSION_COOKIE]: result.session.token }));
    expect(user).toMatchObject({
      id: vend().id,
      role: "VENDEDORA",
      sessionKind: "POS",
      deviceId: device.deviceId,
      location: { code: "TIENDA_RANCAGUA" },
      activeLocation: { code: "TIENDA_RANCAGUA" },
    });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "AUTH_LOGIN", userId: vend().id } });
    expect(audit).toMatchObject({ locationId: f.loc.TIENDA_RANCAGUA });
    expect(audit.after).toMatchObject({ method: "PIN", deviceId: device.deviceId });
    expect(await auditDump()).not.toContain(pin);
  });

  it("las vendedoras que se ofrecen son las de ESA tienda con PIN definido", async () => {
    await setPinFor(f, vend().id);
    const otra = await createExtraStore();
    const foranea = await db.user.create({ data: { name: "Vendedora de otra tienda", role: "VENDEDORA", locationId: otra.id } });
    await setPinFor(f, foranea.id);
    const found = await listOperators(device.token);
    expect(found?.device.locationName).toBe("Tienda Rancagua");
    expect(found?.operators.map((o) => o.name)).toEqual(["Vendedora Rancagua"]); // la 2.ª no tiene PIN; la foránea es de otra tienda
    expect(await listOperators(undefined)).toBeNull();
    expect(await listOperators("token-inventado")).toBeNull();
  });

  it("PIN incorrecto: avisa cuántos intentos quedan y registra el fallo", async () => {
    const pin = await setPinFor(f, vend().id);
    await expectAppError(login(vend().id, otherPin(pin)), "VALIDATION", /PIN incorrecto\. Quedan 4 intentos/);
    await expectAppError(login(vend().id, otherPin(pin)), "VALIDATION", /Quedan 3 intentos/);
    expect((await db.user.findUniqueOrThrow({ where: { id: vend().id } })).failedPinAttempts).toBe(2);
    const audits = await db.auditLog.findMany({ where: { action: "POS_PIN_FAILED", entityId: vend().id } });
    expect(audits).toHaveLength(2);
    expect(audits[0].after).toMatchObject({ deviceId: device.deviceId, attempts: 1 });
    expect(await db.session.count()).toBe(0);
  });

  it("5 fallos bloquean el PIN 15 minutos, incluso con el PIN correcto; pasado el bloqueo vuelve a servir", async () => {
    const pin = await setPinFor(f, vend().id);
    for (let i = 1; i <= 4; i++) await expectAppError(login(vend().id, otherPin(pin)), "VALIDATION", /PIN incorrecto/);
    await expectAppError(login(vend().id, otherPin(pin)), "VALIDATION", /se bloqueó por 15 minutos/);
    await expectAppError(login(vend().id, pin), "FORBIDDEN", /bloqueado/);
    expect(await db.auditLog.count({ where: { action: "POS_PIN_LOCKED", entityId: vend().id } })).toBe(1);

    await db.$executeRaw`UPDATE users SET pin_locked_until = now() - interval '1 minute' WHERE id = ${vend().id}`;
    await expect(login(vend().id, pin)).resolves.toBeDefined();
    expect((await db.user.findUniqueOrThrow({ where: { id: vend().id } })).failedPinAttempts).toBe(0);
  });

  it("respeta pin_max_attempts y pin_lock_minutes de settings", async () => {
    const pin = await setPinFor(f, vend().id);
    await db.setting.update({ where: { key: "pin_max_attempts" }, data: { valueInt: 2 } });
    await expectAppError(login(vend().id, otherPin(pin)), "VALIDATION", /Quedan 1 intento\./);
    await expectAppError(login(vend().id, otherPin(pin)), "VALIDATION", /se bloqueó/);
    await expectAppError(login(vend().id, pin), "FORBIDDEN", /bloqueado/);
  });

  it("sin los ajustes en la tabla settings se usan los valores por omisión (5 intentos, 15 min)", async () => {
    const pin = await setPinFor(f, vend().id);
    await db.setting.deleteMany({ where: { key: { in: ["pin_max_attempts", "pin_lock_minutes"] } } });
    for (let i = 1; i <= 4; i++) await expectAppError(login(vend().id, otherPin(pin)), "VALIDATION", /PIN incorrecto/);
    await expectAppError(login(vend().id, otherPin(pin)), "VALIDATION", /15 minutos/);
  });

  it("solo entra una vendedora de la tienda del dispositivo; cualquier otro caso responde como un PIN equivocado", async () => {
    const pin = await setPinFor(f, vend().id);
    const otra = await createExtraStore();
    const foranea = await db.user.create({ data: { name: "Vendedora de otra tienda", role: "VENDEDORA", locationId: otra.id } });
    const foraneaPin = await setPinFor(f, foranea.id);
    const adminPin = randomPin();
    await db.user.update({ where: { id: f.actors.belen.id }, data: { pinHash: hashPin(adminPin) } });

    // De otra tienda, administradora, bodega e inexistente: ninguna entra por el equipo de Rancagua.
    await expectAppError(login(foranea.id, foraneaPin), "VALIDATION", /^PIN incorrecto\.$/);
    await expectAppError(login(f.actors.belen.id, adminPin), "VALIDATION", /^PIN incorrecto\.$/);
    await expectAppError(login(f.actors.bodega.id, pin), "VALIDATION", /^PIN incorrecto\.$/);
    await expectAppError(login("no-existe", pin), "VALIDATION", /^PIN incorrecto\.$/);
    // Sin PIN definido (vendedora 2): tampoco.
    await expectAppError(login(f.actors.vendRga2.id, pin), "VALIDATION", /^PIN incorrecto\.$/);
    expect(await db.session.count()).toBe(0);
  });

  it("un equipo sin vincular, desconocido o revocado no permite entrar", async () => {
    const pin = await setPinFor(f, vend().id);
    await expectAppError(loginWithPin({ deviceToken: undefined, userId: vend().id, pin }), "FORBIDDEN", /no está vinculado/);
    await expectAppError(loginWithPin({ deviceToken: "token-inventado", userId: vend().id, pin }), "FORBIDDEN", /no está vinculado/);
    await revokeDevice({ actor: f.actors.belen, deviceId: device.deviceId });
    await expectAppError(login(vend().id, pin), "FORBIDDEN", /no está vinculado/);
  });

  it("una vendedora desactivada no entra y su sesión abierta deja de servir", async () => {
    const pin = await setPinFor(f, vend().id);
    const { session } = await login(vend().id, pin);
    await db.user.update({ where: { id: vend().id }, data: { active: false } });
    expect(await resolveUser(jar({ [SESSION_COOKIE]: session.token }))).toBeNull();
    await expectAppError(login(vend().id, pin), "VALIDATION", /PIN incorrecto/);
  });

  it("si la vendedora cambia de tienda, la sesión de caja deja de servir", async () => {
    const pin = await setPinFor(f, vend().id);
    const { session } = await login(vend().id, pin);
    const otra = await createExtraStore();
    await db.user.update({ where: { id: vend().id }, data: { locationId: otra.id } });
    expect(await resolveUser(jar({ [SESSION_COOKIE]: session.token }))).toBeNull();
  });
});

describe("vigencia de la sesión de caja", () => {
  it("vence a los 60 minutos de inactividad (a los 59 todavía sirve)", async () => {
    const pin = await setPinFor(f, vend().id);
    const { session } = await login(vend().id, pin);
    await ageSession(session.token, { idleMinutes: 59 });
    expect(await resolveUser(jar({ [SESSION_COOKIE]: session.token }))).not.toBeNull();
    await ageSession(session.token, { idleMinutes: 61 });
    expect(await resolveUser(jar({ [SESSION_COOKIE]: session.token }))).toBeNull();
  });

  it("vence a las 12 horas del turno aunque haya actividad", async () => {
    const pin = await setPinFor(f, vend().id);
    const { session } = await login(vend().id, pin);
    await ageSession(session.token, { expiredMinutes: 1 });
    expect(await resolveUser(jar({ [SESSION_COOKIE]: session.token }))).toBeNull();
  });

  it("al vencer, la vendedora vuelve a entrar con su PIN en el mismo equipo (el carrito vive en el navegador)", async () => {
    const pin = await setPinFor(f, vend().id);
    const first = await login(vend().id, pin);
    await ageSession(first.session.token, { idleMinutes: 90 });
    expect(await resolveUser(jar({ [SESSION_COOKIE]: first.session.token }))).toBeNull();
    const second = await login(vend().id, pin);
    expect(await resolveUser(jar({ [SESSION_COOKIE]: second.session.token }))).toMatchObject({ id: vend().id, sessionKind: "POS" });
    const resolved: ResolvedSession | null = await resolveSession(second.session.token);
    expect(resolved?.device?.id).toBe(device.deviceId);
  });
});

describe("PIN de aprobación de la administradora (RF-AUT-05)", () => {
  async function adminWithPassword() {
    const u = await createWebUser({ name: "Administradora de prueba" });
    return { u, actor: { id: u.id, role: "ADMIN" as const, location: null } };
  }

  it("lo define confirmando su contraseña y sirve para aprobar presencialmente", async () => {
    const { u, actor } = await adminWithPassword();
    const pin = randomPin();
    await setOwnApprovalPin({ actor, password: u.password, pin });
    const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(verifyPin(pin, user.pinHash!)).toBe(true);
    expect(await auditDump()).not.toContain(pin);

    // Con ese PIN la administradora aprueba en el equipo de la caja (el flujo completo está en approvals-pin.test.ts).
    await openCaja(f);
    const { result: request } = await requestDiscount(f, [{ sku: PBA_XL, qty: 2, discountBps: 1000 }]);
    const { result } = await approveWithPin({ actor: f.actors.vendRga, requestId: request.id, approverId: u.id, pin, idempotencyKey: newKey("pin") });
    expect(result).toMatchObject({ status: "APROBADA", method: "PIN" });
  });

  it("con una contraseña equivocada no cambia nada y cuenta intentos", async () => {
    const { u, actor } = await adminWithPassword();
    await expectAppError(setOwnApprovalPin({ actor, password: "mala", pin: randomPin() }), "VALIDATION", /contraseña no es correcta/);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).pinHash).toBeNull();
    for (let i = 0; i < 4; i++) await setOwnApprovalPin({ actor, password: "mala", pin: randomPin() }).catch(() => undefined);
    await expectAppError(setOwnApprovalPin({ actor, password: u.password, pin: randomPin() }), "FORBIDDEN", /Demasiados intentos/);
  });

  it("aplica la política del PIN y solo lo define una administradora", async () => {
    const { u, actor } = await adminWithPassword();
    await expectAppError(setOwnApprovalPin({ actor, password: u.password, pin: "1234" }), "VALIDATION", /6 dígitos/);
    await expectAppError(setOwnApprovalPin({ actor, password: u.password, pin: "111111" }), "VALIDATION");
    await expectAppError(setOwnApprovalPin({ actor: f.actors.vendRga, password: "x", pin: randomPin() }), "FORBIDDEN", /rol/);
    // La administradora de la demo no tiene contraseña: no puede usar esta vía.
    await expectAppError(setOwnApprovalPin({ actor: f.actors.belen, password: randomPassword(), pin: randomPin() }), "FORBIDDEN", /no tiene contraseña/);
  });
});
