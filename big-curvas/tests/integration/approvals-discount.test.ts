import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { approveRequest, countPendingApprovals, createApprovalRequest, getApprovalStatus, listApprovals, rejectRequest } from "@/modules/approvals";
import { expectAppError, expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";
import { approve, JMT_AZU, openCaja, PBA_XL, reject, requestDiscount, sellWith } from "./approvals-helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
  await openCaja(f);
});

const PCT10 = 1000; // 10 %
const cart = (qty = 2, bps = PCT10) => [{ sku: PBA_XL, qty, discountBps: bps }];

const statusOf = async (id: string) => (await db.approvalRequest.findUniqueOrThrow({ where: { id } })).status;

describe("descuento de la vendedora con aprobación de Belén", () => {
  it("sin aprobación se bloquea; aprobada la venta pasa y la aprobación queda USADA", async () => {
    const pba = await f.variant(PBA_XL);
    await expectAppError(sellWith(f, cart()), "APROBACION_REQUERIDA", /Requiere aprobación de Belén/);

    const { result: req } = await requestDiscount(f, cart());
    expect(req).toMatchObject({ type: "DESCUENTO_SOBRE_LIMITE", status: "PENDIENTE", locationId: f.loc.TIENDA_RANCAGUA });
    expect(req.amount).toBe(1798); // 10 % de 2 × $8.990
    expect(req.reason).toMatch(/Clienta frecuente/);
    expect(req.display.headline).toMatch(/Descuento de \$1\.798/);
    // Mientras está pendiente, la venta sigue bloqueada.
    await expectAppError(sellWith(f, cart(), { approvalId: req.id }), "APROBACION_REQUERIDA", /todavía no responde/);

    const { result: approved } = await approve(f, req.id, undefined, "Dale, es clienta de siempre");
    expect(approved).toMatchObject({ status: "APROBADA", method: "REMOTA", decidedByName: "Belén", decisionComment: "Dale, es clienta de siempre" });

    const { result: sale } = await sellWith(f, cart(), { approvalId: req.id });
    expect(sale.discountTotal).toBe(1798);
    expect(sale.total).toBe(2 * 8990 - 1798);
    expect(await stockOf(pba, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 3, reserved: 0 });

    const used = await db.approvalRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(used).toMatchObject({ status: "USADA", usedRefType: "SALE", usedRefId: sale.id });
    expect(used.usedAt).not.toBeNull();
    const line = await db.saleLine.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(line.discountApprovalId).toBe(req.id);
    expect(await db.auditLog.count({ where: { action: "DISCOUNT_APPROVED", entityId: sale.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "APPROVAL_DECISION", entityId: req.id } })).toBe(1);
    await expectInvariants();
  });

  it("una aprobación sirve una sola vez", async () => {
    const pba = await f.variant(PBA_XL);
    const { result: req } = await requestDiscount(f, cart());
    await approve(f, req.id);
    await sellWith(f, cart(), { approvalId: req.id });

    await expectAppError(sellWith(f, cart(), { approvalId: req.id }), "APROBACION_INVALIDA", /ya fue usada/);
    expect(await db.sale.count()).toBe(1);
    expect(await stockOf(pba, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 3, reserved: 0 });
  });

  it("dos ventas simultáneas con la misma aprobación: gana una sola", async () => {
    const { result: req } = await requestDiscount(f, cart(1));
    await approve(f, req.id);

    const results = await Promise.allSettled([
      sellWith(f, cart(1), { approvalId: req.id }),
      sellWith(f, cart(1), { approvalId: req.id }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
    expect(lost.reason).toMatchObject({ code: "APROBACION_INVALIDA" });
    expect(await db.sale.count()).toBe(1);
    await expectInvariants();
  });

  it("si el carrito cambia después de aprobar (% , cantidad, prendas), la aprobación ya no sirve y sigue disponible", async () => {
    const { result: req } = await requestDiscount(f, cart(2, PCT10));
    await approve(f, req.id);

    await expectAppError(sellWith(f, cart(2, 2000), { approvalId: req.id }), "APROBACION_INVALIDA", /carrito cambió/); // otro %
    await expectAppError(sellWith(f, cart(3, PCT10), { approvalId: req.id }), "APROBACION_INVALIDA", /carrito cambió/); // otra cantidad
    await expectAppError(
      sellWith(f, [...cart(2, PCT10), { sku: JMT_AZU, qty: 1, discountBps: 0 }], { approvalId: req.id }),
      "APROBACION_INVALIDA",
      /carrito cambió/,
    ); // otra prenda
    await expectAppError(sellWith(f, [{ sku: JMT_AZU, qty: 1, discountBps: PCT10 }], { approvalId: req.id }), "APROBACION_INVALIDA", /carrito cambió/);

    expect(await db.sale.count()).toBe(0);
    expect(await statusOf(req.id)).toBe("APROBADA"); // los rechazos no la consumen
    await sellWith(f, cart(2, PCT10), { approvalId: req.id }); // el carrito aprobado sí pasa
    expect(await statusOf(req.id)).toBe("USADA");
  });

  it("si cambia el monto (un precio sube) con el mismo carrito, tampoco sirve", async () => {
    const { result: req } = await requestDiscount(f, cart());
    await approve(f, req.id);
    await db.product.updateMany({ where: { modelCode: "PBA041" }, data: { basePrice: 9990 } });

    await expectAppError(sellWith(f, cart(), { approvalId: req.id }), "APROBACION_INVALIDA", /carrito cambió/);
    expect(await db.sale.count()).toBe(0);
  });

  it("una aprobación de otra ubicación o de otro tipo no sirve", async () => {
    const { result: req } = await requestDiscount(f, cart());
    await approve(f, req.id);

    await db.approvalRequest.update({ where: { id: req.id }, data: { locationId: f.loc.BODEGA } });
    await expectAppError(sellWith(f, cart(), { approvalId: req.id }), "APROBACION_INVALIDA", /otra ubicación/);
    await db.approvalRequest.update({ where: { id: req.id }, data: { locationId: f.loc.TIENDA_RANCAGUA, type: "ANULACION" } });
    await expectAppError(sellWith(f, cart(), { approvalId: req.id }), "APROBACION_INVALIDA", /tipo de acción/);
    await expectAppError(sellWith(f, cart(), { approvalId: "no-existe-123" }), "APROBACION_INVALIDA", /no existe/);
  });

  it("vencida: la aprobada deja de servir y la pendiente no se puede aprobar", async () => {
    const { result: approvedReq } = await requestDiscount(f, cart());
    await approve(f, approvedReq.id);
    const { result: pendingReq } = await requestDiscount(f, cart(1, 500));
    const past = new Date(Date.now() - 60_000);
    await db.approvalRequest.updateMany({ where: { id: { in: [approvedReq.id, pendingReq.id] } }, data: { expiresAt: past } });

    await expectAppError(sellWith(f, cart(), { approvalId: approvedReq.id }), "APROBACION_INVALIDA", /venció/);
    expect(await db.sale.count()).toBe(0);
    await expectAppError(approve(f, pendingReq.id), "CONFLICT", /venció/);
    expect(await statusOf(pendingReq.id)).toBe("VENCIDA");
    expect(await statusOf(approvedReq.id)).toBe("VENCIDA");
    // La caja que espera ve el estado final.
    expect((await getApprovalStatus({ actor: f.actors.vendRga, approvalId: pendingReq.id })).status).toBe("VENCIDA");
  });

  it("vigencia: la pendiente vence a los X min de creada y la aprobada a los X min desde la decisión", async () => {
    const { result: req } = await requestDiscount(f, cart());
    const minutes = (await db.setting.findUniqueOrThrow({ where: { key: "approval_timeout_minutes" } })).valueInt!;
    expect(minutes).toBe(10);
    const createdMs = req.expiresAt!.getTime() - req.createdAt.getTime();
    expect(Math.abs(createdMs - minutes * 60_000)).toBeLessThan(5_000);

    // Se atrasa la creación 9 min: aprobar ahora da otros X min desde la decisión (no 1 min).
    await db.approvalRequest.update({ where: { id: req.id }, data: { expiresAt: new Date(Date.now() + 60_000) } });
    const { result } = await approve(f, req.id);
    const left = result.expiresAt!.getTime() - Date.now();
    expect(left).toBeGreaterThan((minutes - 1) * 60_000);
  });

  it("rechazada: la venta no pasa y no queda nada a medias", async () => {
    const pba = await f.variant(PBA_XL);
    const { result: req } = await requestDiscount(f, cart());
    const { result } = await reject(f, req.id, undefined, "No, muy poco margen");
    expect(result).toMatchObject({ status: "RECHAZADA", decisionComment: "No, muy poco margen" });

    await expectAppError(sellWith(f, cart(), { approvalId: req.id }), "APROBACION_INVALIDA", /rechazó/);
    expect(await db.sale.count()).toBe(0);
    expect(await stockOf(pba, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 5, reserved: 0 });
    await expectInvariants();
  });

  it("decidir dos veces, o decidir lo ya decidido, es CONFLICT; con la misma clave es idempotente", async () => {
    const { result: req } = await requestDiscount(f, cart());
    const key = newKey("aprobar");
    const first = await approve(f, req.id, key);
    const replay = await approve(f, req.id, key);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);

    await expectAppError(approve(f, req.id), "CONFLICT", /ya está aprobada/);
    await expectAppError(reject(f, req.id), "CONFLICT", /ya está aprobada/);
    expect(await db.auditLog.count({ where: { action: "APPROVAL_DECISION", entityId: req.id } })).toBe(1);
  });

  it("aprobar y rechazar al mismo tiempo: gana una sola decisión", async () => {
    const { result: req } = await requestDiscount(f, cart());
    const results = await Promise.allSettled([approve(f, req.id), reject(f, req.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(["APROBADA", "RECHAZADA"]).toContain(await statusOf(req.id));
  });

  it("crear la solicitud es idempotente (doble clic) y no se pide lo que no lo necesita", async () => {
    const key = newKey("solicitud");
    const results = await Promise.all([requestDiscount(f, cart(), { key }), requestDiscount(f, cart(), { key })]);
    expect(results[0].result.id).toBe(results[1].result.id);
    expect(await db.approvalRequest.count()).toBe(1);
    expect((await requestDiscount(f, cart(), { key })).replayed).toBe(true);

    await expectAppError(requestDiscount(f, cart(2, 0)), "VALIDATION", /no tiene descuentos sobre el límite/);
    await expectAppError(requestDiscount(f, cart(), { reason: " " }), "VALIDATION", /motivo/);
  });

  it("bandeja de Belén: pendientes (más antiguas primero), historial y contador", async () => {
    const { result: a } = await requestDiscount(f, cart(1));
    const { result: b } = await requestDiscount(f, cart(2));
    await approve(f, a.id);
    expect(await countPendingApprovals()).toBe(1);

    const { pending, recent } = await listApprovals({ actor: f.actors.belen });
    expect(pending.map((p) => p.id)).toEqual([b.id]);
    expect(recent.map((r) => r.id)).toEqual([a.id]);
    expect(pending[0]).toMatchObject({ requestedByName: "Vendedora Rancagua", locationName: "Tienda Rancagua" });
  });
});

describe("acceso a las aprobaciones", () => {
  it("la vendedora no puede aprobar ni rechazar ni ver la bandeja de Belén", async () => {
    const { result: req } = await requestDiscount(f, cart());
    const vend = f.actors.vendRga;
    await expectAppError(approveRequest({ actor: vend, requestId: req.id, idempotencyKey: newKey("a") }), "FORBIDDEN");
    await expectAppError(rejectRequest({ actor: vend, requestId: req.id, idempotencyKey: newKey("r") }), "FORBIDDEN");
    await expectAppError(listApprovals({ actor: vend }), "FORBIDDEN");
    expect(await statusOf(req.id)).toBe("PENDIENTE");
  });

  it("solo una VENDEDORA de la ubicación pide aprobación (ni BODEGA ni ADMIN), y solo ve lo de su ubicación", async () => {
    const payload = {
      type: "DESCUENTO_SOBRE_LIMITE" as const,
      locationId: f.loc.TIENDA_RANCAGUA,
      amount: 899,
      binding: "a".repeat(64),
      reason: "Prueba de acceso",
      display: { headline: "x", lines: [] },
      idempotencyKey: newKey("sol"),
    };
    await expectAppError(createApprovalRequest({ actor: f.actors.bodega, ...payload }), "FORBIDDEN");
    await expectAppError(createApprovalRequest({ actor: f.actors.belen, ...payload }), "FORBIDDEN");
    // Una vendedora no pide por otra ubicación (BODEGA).
    await expectAppError(createApprovalRequest({ actor: f.actors.vendRga, ...payload, locationId: f.loc.BODEGA, idempotencyKey: newKey("sol") }), "FORBIDDEN");

    // Solicitud de otra ubicación: la vendedora de Rancagua no consulta su estado.
    const { result: req } = await requestDiscount(f, cart());
    await db.approvalRequest.update({ where: { id: req.id }, data: { locationId: f.loc.BODEGA } });
    await expectAppError(getApprovalStatus({ actor: f.actors.vendRga, approvalId: req.id }), "FORBIDDEN");
    expect((await getApprovalStatus({ actor: f.actors.belen, approvalId: req.id })).id).toBe(req.id);
  });

  it("el ADMIN no necesita aprobación: su descuento pasa directo y queda en audit_log", async () => {
    const { result: sale } = await sellWith(f, cart(), { actor: f.actors.belen });
    expect(sale.discountTotal).toBe(1798);
    expect(await db.approvalRequest.count()).toBe(0);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "DISCOUNT_OVERRIDE", entityId: sale.id } });
    expect(audit.userId).toBe(f.actors.belen.id);
    expect(await db.auditLog.count({ where: { action: "DISCOUNT_APPROVED" } })).toBe(0);
  });
});
