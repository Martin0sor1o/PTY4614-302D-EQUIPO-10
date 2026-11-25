import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  changePassword,
  loginWithPassword,
  loginWithPin,
  redeemPairingCode,
  setOwnApprovalPin,
} from "@/modules/auth";
import { resetDemo, type Fixtures } from "./helpers";
import { createWebUser, linkDevice, otherPin, randomPassword, randomPin, sessionRow, setPinFor } from "./auth-helpers";

// Peticiones SIMULTÁNEAS contra los bloqueos. El intento se cuenta ANTES de verificar: aunque lleguen N peticiones a la vez,
// como mucho `max` llegan a verificar la contraseña / el PIN / el código; el resto se rechaza sin verificar nada.
// Las verificaciones se cuentan con espías sobre las funciones reales (siguen verificando de verdad).

const spies = vi.hoisted(() => ({ verifySecret: 0, verifyPin: 0 }));
vi.mock("@/lib/scrypt-hash", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/scrypt-hash")>();
  return {
    ...real,
    verifySecret: (...args: Parameters<typeof real.verifySecret>) => {
      spies.verifySecret++;
      return real.verifySecret(...args);
    },
  };
});
vi.mock("@/modules/approvals", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/modules/approvals")>();
  return {
    ...real,
    verifyPin: (...args: Parameters<typeof real.verifyPin>) => {
      spies.verifyPin++;
      return real.verifyPin(...args);
    },
  };
});

const N = 25; // peticiones simultáneas (bastante más que cualquier límite)

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
  spies.verifySecret = 0;
  spies.verifyPin = 0;
});

const settle = (promises: Promise<unknown>[]) => Promise.allSettled(promises);
const codes = (results: PromiseSettledResult<unknown>[]) =>
  results.map((r) => (r.status === "rejected" ? (r.reason as { code: string }).code : "OK"));
const count = (action: string) => db.auditLog.count({ where: { action } });

describe("login con contraseña: peticiones simultáneas", () => {
  it(`${N} intentos a la vez con la contraseña mala: solo 5 verifican; el resto rechaza sin verificar; un solo bloqueo`, async () => {
    const u = await createWebUser();
    spies.verifySecret = 0;
    const results = await settle(Array.from({ length: N }, () => loginWithPassword({ email: u.email, password: "mala" })));

    expect(codes(results).every((c) => c !== "OK")).toBe(true);
    expect(spies.verifySecret).toBe(5); // exactamente el límite: ni una verificación de más
    expect(await count("AUTH_LOGIN_FAILED")).toBe(5);
    expect(await count("AUTH_LOCKED")).toBe(1);
    const throttle = (await db.authThrottle.findMany())[0];
    expect(throttle.lockedUntil).not.toBeNull();
    expect(throttle.failedAttempts).toBeLessThanOrEqual(6); // topado en max + 1: no crece sin límite
    // Ya bloqueada: ni la contraseña correcta entra.
    await expect(loginWithPassword({ email: u.email, password: u.password })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("mezclar la contraseña correcta con malas a la vez no permite más de 5 verificaciones", async () => {
    const u = await createWebUser();
    spies.verifySecret = 0;
    const results = await settle(
      Array.from({ length: N }, (_, i) => loginWithPassword({ email: u.email, password: i % 5 === 0 ? u.password : "mala" })),
    );
    expect(spies.verifySecret).toBeLessThanOrEqual(5 + 5); // 5 por ventana; el acierto reinicia, nunca crece con N
    expect(spies.verifySecret).toBeLessThan(N);
    expect(codes(results).filter((c) => c === "OK").length).toBeLessThanOrEqual(5);
  });

  it("un email que no existe se limita igual (no se pueden esquivar los 5 intentos)", async () => {
    await createWebUser();
    const results = await settle(Array.from({ length: N }, () => loginWithPassword({ email: "fantasma@auth.test", password: "mala" })));
    expect(codes(results).filter((c) => c === "FORBIDDEN").length).toBeGreaterThanOrEqual(N - 5);
    expect(await count("AUTH_LOGIN_FAILED")).toBe(5);
  });

  it("un acierto reinicia el contador (4 fallos + éxito + 4 fallos no bloquean)", async () => {
    const u = await createWebUser();
    for (let i = 0; i < 4; i++) await loginWithPassword({ email: u.email, password: "mala" }).catch(() => undefined);
    await loginWithPassword({ email: u.email, password: u.password });
    expect((await db.authThrottle.findMany())[0]).toMatchObject({ failedAttempts: 0, lockedUntil: null });
    for (let i = 0; i < 4; i++) await loginWithPassword({ email: u.email, password: "mala" }).catch(() => undefined);
    await expect(loginWithPassword({ email: u.email, password: u.password })).resolves.toBeDefined();
  });
});

describe("cambio de contraseña y PIN de aprobación: peticiones simultáneas", () => {
  it(`changePassword: ${N} intentos a la vez con la actual mala: solo 5 verifican`, async () => {
    const u = await createWebUser();
    const { session } = await loginWithPassword({ email: u.email, password: u.password });
    const sessionId = (await sessionRow(session.token)).id;
    spies.verifySecret = 0;
    const results = await settle(
      Array.from({ length: N }, () => changePassword({ userId: u.id, sessionId, current: "no-es-esta", next: randomPassword() })),
    );
    expect(codes(results).every((c) => c !== "OK")).toBe(true);
    expect(spies.verifySecret).toBe(5);
    expect(await count("AUTH_LOCKED")).toBe(1);
    // Con la contraseña buena tampoco, mientras dure el bloqueo.
    await expect(changePassword({ userId: u.id, sessionId, current: u.password, next: randomPassword() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).passwordChangedAt).toBeNull();
  });

  it(`setOwnApprovalPin: ${N} intentos a la vez con la contraseña mala: solo 5 verifican y no se define ningún PIN`, async () => {
    const u = await createWebUser();
    await db.user.update({ where: { id: u.id }, data: { pinHash: null } });
    spies.verifySecret = 0;
    const actor = { id: u.id, role: "ADMIN" as const, location: null };
    const results = await settle(Array.from({ length: N }, () => setOwnApprovalPin({ actor, password: "mala", pin: randomPin() })));
    expect(codes(results).every((c) => c !== "OK")).toBe(true);
    expect(spies.verifySecret).toBe(5);
    expect(await count("AUTH_LOCKED")).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).pinHash).toBeNull();
  });

  it("cambio de contraseña y PIN de aprobación comparten el límite (no se duplica probando por los dos lados)", async () => {
    const u = await createWebUser();
    const { session } = await loginWithPassword({ email: u.email, password: u.password });
    const sessionId = (await sessionRow(session.token)).id;
    const actor = { id: u.id, role: "ADMIN" as const, location: null };
    spies.verifySecret = 0;
    await settle([
      ...Array.from({ length: 10 }, () => changePassword({ userId: u.id, sessionId, current: "mala", next: randomPassword() })),
      ...Array.from({ length: 10 }, () => setOwnApprovalPin({ actor, password: "mala", pin: randomPin() })),
    ]);
    expect(spies.verifySecret).toBe(5);
  });
});

describe("PIN de caja: peticiones simultáneas", () => {
  it(`${N} intentos a la vez con el PIN malo: solo 5 verifican; un solo bloqueo; el PIN bueno tampoco entra`, async () => {
    const device = await linkDevice(f);
    const user = f.actors.vendRga;
    const pin = await setPinFor(f, user.id);
    spies.verifyPin = 0;

    const results = await settle(Array.from({ length: N }, () => loginWithPin({ deviceToken: device.token, userId: user.id, pin: otherPin(pin) })));
    expect(codes(results).every((c) => c !== "OK")).toBe(true);
    expect(spies.verifyPin).toBe(5);
    expect(await count("POS_PIN_FAILED")).toBe(4);
    expect(await count("POS_PIN_LOCKED")).toBe(1);
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.failedPinAttempts).toBe(5); // los rechazados por el bloqueo no cuentan
    expect(row.pinLockedUntil).not.toBeNull();
    expect(row.pinLockedUntil!.getTime()).toBeGreaterThan(Date.now());

    await expect(loginWithPin({ deviceToken: device.token, userId: user.id, pin })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("el PIN bueno mezclado con malos a la vez: nunca más de 5 verificaciones en la ventana", async () => {
    const device = await linkDevice(f);
    const user = f.actors.vendRga;
    const pin = await setPinFor(f, user.id);
    spies.verifyPin = 0;
    await settle(Array.from({ length: N }, (_, i) => loginWithPin({ deviceToken: device.token, userId: user.id, pin: i % 5 === 0 ? pin : otherPin(pin) })));
    expect(spies.verifyPin).toBeLessThanOrEqual(10);
    expect(spies.verifyPin).toBeLessThan(N);
  });

  it("un acierto reinicia el contador del PIN", async () => {
    const device = await linkDevice(f);
    const user = f.actors.vendRga;
    const pin = await setPinFor(f, user.id);
    for (let i = 0; i < 4; i++) await loginWithPin({ deviceToken: device.token, userId: user.id, pin: otherPin(pin) }).catch(() => undefined);
    await loginWithPin({ deviceToken: device.token, userId: user.id, pin });
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ failedPinAttempts: 0, pinLockedUntil: null });
  });

  it("un bloqueo ya vencido se reinicia: el siguiente intento cuenta como el primero", async () => {
    const device = await linkDevice(f);
    const user = f.actors.vendRga;
    const pin = await setPinFor(f, user.id);
    for (let i = 0; i < 5; i++) await loginWithPin({ deviceToken: device.token, userId: user.id, pin: otherPin(pin) }).catch(() => undefined);
    await db.$executeRaw`UPDATE users SET pin_locked_until = now() - interval '1 minute' WHERE id = ${user.id}`;
    await expect(loginWithPin({ deviceToken: device.token, userId: user.id, pin: otherPin(pin) })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ failedPinAttempts: 1, pinLockedUntil: null });
  });
});

describe("vinculación de equipos: peticiones simultáneas", () => {
  it(`${N} códigos malos a la vez: solo 10 se prueban; después todo se rechaza como bloqueado`, async () => {
    const results = await settle(Array.from({ length: N }, () => redeemPairingCode({ code: "ZZZZZZZZ" })));
    expect(codes(results).every((c) => c !== "OK")).toBe(true);
    expect(await count("POS_DEVICE_PAIRING_FAILED")).toBe(10);
    expect(codes(results).filter((c) => c === "FORBIDDEN").length).toBe(N - 10);
    // Con el bloqueo vigente tampoco sirve un código bueno.
    await expect(linkDevice(f)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
