import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  changePassword,
  createAdminAccount,
  createPairingCode,
  createSalesAccount,
  loginWithPassword,
  loginWithPin,
  redeemPairingCode,
  resetPasswordAccount,
  revokeDevice,
  revokeSessionByToken,
  setOwnApprovalPin,
  setSalesPin,
} from "@/modules/auth";
import { resetDemo, type Fixtures } from "./helpers";
import { otherPin, randomPassword, randomPin, sessionRow } from "./auth-helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

// Regla 9: toda operación sensible de autenticación deja huella en audit_log, y NUNCA con secretos (contraseñas, PIN,
// tokens, códigos, hashes) ni con el email escrito.
describe("auditoría de autenticación", () => {
  it("cada evento queda registrado y el registro completo no contiene ningún secreto", async () => {
    const secrets: string[] = [];
    const keep = <T extends string>(value: T) => (secrets.push(value), value);

    // Administradora: alta por script, fallos, bloqueo, ingreso, cambio de contraseña, PIN propio y reinicio.
    const email = "belen.auditoria@auth.test";
    const temp = keep(randomPassword());
    await createAdminAccount({ email, name: "Belén de auditoría", password: temp });
    const wrong = keep("clave-equivocada-123");
    for (let i = 0; i < 5; i++) await loginWithPassword({ email, password: wrong }).catch(() => undefined); // 5 fallos → bloqueo
    await db.$executeRaw`UPDATE auth_throttles SET locked_until = now() - interval '1 minute'`;
    const login = await loginWithPassword({ email, password: temp });
    keep(login.session.token);
    const next = keep(randomPassword());
    await changePassword({ userId: login.userId, sessionId: (await sessionRow(login.session.token)).id, current: temp, next });
    const approvalPin = keep(randomPin());
    await setOwnApprovalPin({ actor: { id: login.userId, role: "ADMIN", location: null }, password: next, pin: approvalPin });
    const reset = keep(randomPassword());
    await resetPasswordAccount({ email, password: reset });
    await revokeSessionByToken(login.session.token);

    // Caja: código, vinculación (válida y fallida), PIN (definir, fallar hasta bloquear, entrar) y revocación.
    const pairing = await createPairingCode({ actor: f.actors.belen, locationId: f.loc.TIENDA_RANCAGUA, name: "Caja de auditoría" });
    keep(pairing.code);
    keep(pairing.code.replace("-", ""));
    await redeemPairingCode({ code: "ZZZZZZZZ" }).catch(() => undefined);
    const linked = await redeemPairingCode({ code: pairing.code });
    keep(linked.token);
    const pin = keep(randomPin());
    await setSalesPin({ actor: f.actors.belen, userId: f.actors.vendRga.id, pin });
    const bad = keep(otherPin(pin));
    for (let i = 0; i < 5; i++) await loginWithPin({ deviceToken: linked.token, userId: f.actors.vendRga.id, pin: bad }).catch(() => undefined);
    await db.$executeRaw`UPDATE users SET pin_locked_until = now() - interval '1 minute' WHERE id = ${f.actors.vendRga.id}`;
    const posLogin = await loginWithPin({ deviceToken: linked.token, userId: f.actors.vendRga.id, pin });
    keep(posLogin.session.token);
    await revokeDevice({ actor: f.actors.belen, deviceId: linked.deviceId });

    // Alta de vendedora por script.
    const sellerPin = keep(randomPin());
    await createSalesAccount({ name: "Vendedora de auditoría", locationCode: "TIENDA_RANCAGUA", pin: sellerPin });

    const rows = await db.auditLog.findMany({ where: { OR: [{ action: { startsWith: "AUTH_" } }, { action: { startsWith: "POS_" } }] } });
    const actions = new Set(rows.map((r) => r.action));
    for (const expected of [
      "AUTH_ADMIN_CREATED",
      "AUTH_LOGIN",
      "AUTH_LOGIN_FAILED",
      "AUTH_LOCKED",
      "AUTH_PASSWORD_CHANGED",
      "AUTH_PASSWORD_RESET",
      "AUTH_USER_CREATED",
      "POS_PIN_SET",
      "POS_PIN_FAILED",
      "POS_PIN_LOCKED",
      "POS_DEVICE_PAIRING_CREATED",
      "POS_DEVICE_PAIRING_FAILED",
      "POS_DEVICE_LINKED",
      "POS_DEVICE_REVOKED",
    ]) {
      expect(actions, expected).toContain(expected);
    }

    const dump = JSON.stringify(await db.auditLog.findMany());
    for (const secret of secrets) expect(dump, "secreto en la auditoría").not.toContain(secret);
    expect(dump).not.toContain("belen.auditoria"); // ni el email escrito
    expect(dump).not.toMatch(/scrypt\$/); // ni hashes
    // Ninguna CLAVE de los datos auditados suena a secreto (los valores como method: "PIN" son operativos).
    expect(dump).not.toMatch(/"(password|pin|token|secret|passwordHash|pinHash|code)":/i);
  });
});
