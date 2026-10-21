import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { approveWithPin, hashPin, listApprovers, verifyPin } from "@/modules/approvals";
import { expectAppError, newKey, resetDemo, type Fixtures } from "./helpers";
import { approve, openCaja, PBA_XL, PIN, requestDiscount, sellWith } from "./approvals-helpers";

let f: Fixtures;
let belenId: string;
beforeEach(async () => {
  f = await resetDemo();
  await openCaja(f);
  belenId = f.actors.belen.id;
});

const cart = [{ sku: PBA_XL, qty: 2, discountBps: 1000 }];
const pinApprove = (requestId: string, pin: string, opts: { actor?: Fixtures["actors"]["vendRga"]; key?: string; approverId?: string } = {}) =>
  approveWithPin({ actor: opts.actor ?? f.actors.vendRga, requestId, approverId: opts.approverId ?? belenId, pin, idempotencyKey: opts.key ?? newKey("pin") });
const attempts = async () => (await db.user.findUniqueOrThrow({ where: { id: belenId } })).failedPinAttempts;

describe("aprobación presencial con PIN (RF-AUT-05)", () => {
  it("el hash del PIN es scrypt (no queda en claro) y se verifica", () => {
    const h = hashPin("2468");
    expect(h).toMatch(/^scrypt\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(h).not.toContain("2468");
    expect(verifyPin("2468", h)).toBe(true);
    expect(verifyPin("2469", h)).toBe(false);
    expect(hashPin("2468")).not.toBe(h); // sal distinta
  });

  it("PIN correcto: la solicitud queda aprobada con método PIN y la venta pasa", async () => {
    const { result: req } = await requestDiscount(f, cart);
    const { result } = await pinApprove(req.id, PIN);

    expect(result).toMatchObject({ status: "APROBADA", method: "PIN", decidedByName: "Belén" });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "APPROVAL_DECISION", entityId: req.id } });
    expect(audit.after).toMatchObject({ method: "PIN", approvedBy: belenId, decision: "APROBADA" });
    expect(audit.userId).toBe(f.actors.vendRga.id); // quien operó el equipo

    const { result: sale } = await sellWith(f, cart, { approvalId: req.id });
    expect(sale.discountTotal).toBe(1798);
    expect((await db.approvalRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("USADA");
  });

  it("PIN incorrecto: no aprueba, cuenta el intento y avisa cuántos quedan", async () => {
    const { result: req } = await requestDiscount(f, cart);

    await expectAppError(pinApprove(req.id, "0000"), "VALIDATION", /PIN incorrecto\. Quedan 4 intentos/);
    await expectAppError(pinApprove(req.id, "1111"), "VALIDATION", /Quedan 3 intentos/);
    expect(await attempts()).toBe(2);
    expect((await db.approvalRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PENDIENTE");
    expect(await db.auditLog.count({ where: { action: "PIN_FAILED", entityId: belenId } })).toBe(2);

    // Un acierto reinicia el contador.
    await pinApprove(req.id, PIN);
    expect(await attempts()).toBe(0);
  });

  it("5 fallos bloquean el PIN por 15 min, incluso con el PIN correcto", async () => {
    const { result: req } = await requestDiscount(f, cart);
    for (let i = 1; i <= 4; i++) await expectAppError(pinApprove(req.id, "9999"), "VALIDATION", /PIN incorrecto/);
    await expectAppError(pinApprove(req.id, "9999"), "VALIDATION", /se bloqueó por 15 minutos/);

    const locked = await db.user.findUniqueOrThrow({ where: { id: belenId } });
    expect(locked.failedPinAttempts).toBe(5);
    const minutes = (locked.pinLockedUntil!.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);
    expect(await db.auditLog.count({ where: { action: "PIN_LOCKED", entityId: belenId } })).toBe(1);

    await expectAppError(pinApprove(req.id, PIN), "FORBIDDEN", /bloqueado hasta las/);
    expect((await db.approvalRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PENDIENTE");
    expect((await listApprovers({ actor: f.actors.vendRga }))[0].lockedUntil).not.toBeNull();

    // Pasado el bloqueo, el PIN correcto vuelve a funcionar y reinicia el contador.
    await db.user.update({ where: { id: belenId }, data: { pinLockedUntil: new Date(Date.now() - 1_000) } });
    const { result } = await pinApprove(req.id, PIN);
    expect(result.status).toBe("APROBADA");
    expect(await attempts()).toBe(0);
  });

  it("los fallos cuentan solo para la administradora elegida", async () => {
    const otra = await db.user.create({ data: { name: "Otra Admin", email: "otra@bigcurvas.test", role: "ADMIN", pinHash: hashPin("1357") } });
    const { result: req } = await requestDiscount(f, cart);

    await expectAppError(pinApprove(req.id, "0000", { approverId: otra.id }), "VALIDATION", /PIN incorrecto/);
    expect((await db.user.findUniqueOrThrow({ where: { id: otra.id } })).failedPinAttempts).toBe(1);
    expect(await attempts()).toBe(0); // Belén no se toca
    expect((await listApprovers({ actor: f.actors.vendRga })).map((a) => a.name)).toEqual(["Belén", "Otra Admin"]);
    // El PIN de una no sirve para la otra.
    await expectAppError(pinApprove(req.id, "1357", { approverId: belenId }), "VALIDATION", /PIN incorrecto/);
    const { result } = await pinApprove(req.id, "1357", { approverId: otra.id });
    expect(result).toMatchObject({ status: "APROBADA", method: "PIN", decidedByName: "Otra Admin" });
  });

  it("solo se aprueba con el PIN de una administradora activa que tenga PIN", async () => {
    const { result: req } = await requestDiscount(f, cart);
    await expectAppError(pinApprove(req.id, PIN, { approverId: f.actors.vendRga.id }), "VALIDATION", /Elige a la administradora/);
    await expectAppError(pinApprove(req.id, PIN, { approverId: "no-existe" }), "VALIDATION", /Elige a la administradora/);
    await db.user.update({ where: { id: belenId }, data: { pinHash: null } });
    await expectAppError(pinApprove(req.id, PIN), "VALIDATION", /Elige a la administradora/);
    expect(await listApprovers({ actor: f.actors.vendRga })).toEqual([]);
  });

  it("una solicitud ya decidida o vencida no cuenta intentos y es CONFLICT", async () => {
    const { result: done } = await requestDiscount(f, cart);
    await approve(f, done.id);
    await expectAppError(pinApprove(done.id, "0000"), "CONFLICT", /ya está aprobada/);

    const { result: old } = await requestDiscount(f, [{ sku: PBA_XL, qty: 1, discountBps: 500 }]);
    await db.approvalRequest.update({ where: { id: old.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    await expectAppError(pinApprove(old.id, PIN), "CONFLICT", /venció/);
    expect(await attempts()).toBe(0);
  });

  it("es idempotente: repetir la clave no vuelve a verificar ni a contar", async () => {
    const { result: req } = await requestDiscount(f, cart);
    const key = newKey("pin");
    const first = await pinApprove(req.id, PIN, { key });
    const second = await pinApprove(req.id, "0000", { key }); // aunque el PIN fuera otro, ya está decidida con esa clave
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(await attempts()).toBe(0);
    expect(await db.auditLog.count({ where: { action: "APPROVAL_DECISION", entityId: req.id } })).toBe(1);
  });

  it("acceso: solo la vendedora de la ubicación o el ADMIN operan el PIN; BODEGA no", async () => {
    const { result: req } = await requestDiscount(f, cart);
    await expectAppError(pinApprove(req.id, PIN, { actor: f.actors.bodega }), "FORBIDDEN");
    expect(await attempts()).toBe(0);
    const { result } = await pinApprove(req.id, PIN, { actor: f.actors.belen });
    expect(result.method).toBe("PIN");
  });
});
