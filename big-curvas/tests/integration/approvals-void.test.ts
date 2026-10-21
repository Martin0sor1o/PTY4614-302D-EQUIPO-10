import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createApprovalRequest, rejectRequest } from "@/modules/approvals";
import { getCashClosingTotals, getSaleForActor, listSalesOfDay, openCashSession, requestVoidApproval, voidBinding } from "@/modules/sales";
import { countMovements, expectAppError, expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";
import { approvedVoid, approve, closeCajaExact, expectedCashNow, JMT_AZU, openCaja, PBA_XL, sellWith, voidAs } from "./approvals-helpers";
import { confirmTestPayment, registerTestOrder } from "./orders-helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const sale1 = async (opts: Parameters<typeof sellWith>[2] = {}, qty = 2) => (await sellWith(f, [{ sku: PBA_XL, qty }], opts)).result;

describe("anular una venta del día con aprobación", () => {
  it("aprobada: venta ANULADA, stock repuesto con ANULACION_VENTA y aprobación USADA", async () => {
    await openCaja(f);
    const pba = await f.variant(PBA_XL);
    const sale = await sale1();
    expect(await stockOf(pba, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 3, reserved: 0 });

    // Sin aprobación: se bloquea.
    await expectAppError(voidAs(f, sale.id), "APROBACION_REQUERIDA", /aprobación de Belén/);
    expect((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe("COMPLETADA");

    const approvalId = await approvedVoid(f, sale.id);
    const { result } = await voidAs(f, sale.id, { approvalId });

    expect(result.status).toBe("ANULADA");
    expect(result.voided).toMatchObject({ reason: "Error al cobrar", byName: "Vendedora Rancagua", approved: true });
    expect(await stockOf(pba, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 5, reserved: 0 });
    const movements = await db.inventoryMovement.findMany({ where: { refType: "SALE", refId: sale.id }, orderBy: { createdAt: "asc" } });
    expect(movements.map((m) => [m.type, m.quantity])).toEqual([["VENTA_POS", -2], ["ANULACION_VENTA", 2]]); // movimiento inverso, nada se borra
    expect(movements[1]).toMatchObject({ locationId: f.loc.TIENDA_RANCAGUA, userId: f.actors.vendRga.id, onHandAfter: 5 });
    const row = await db.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(row).toMatchObject({ voidedBy: f.actors.vendRga.id, voidApprovalId: approvalId });
    expect(row.voidedAt).not.toBeNull();
    expect(await db.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } })).toMatchObject({ status: "USADA", usedRefType: "SALE", usedRefId: sale.id });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "SALE_VOID", entityId: sale.id } });
    expect(audit.after).toMatchObject({ direct: false, approvalId, reason: "Error al cobrar" });
    expect((await getSaleForActor(f.actors.vendRga, sale.id)).status).toBe("ANULADA");
    await expectInvariants();
  });

  it("la aprobación es de esa venta y de su monto: otra venta o reutilizarla se rechaza", async () => {
    await openCaja(f);
    const a = await sale1();
    const b = await sale1({}, 1);
    const approvalA = await approvedVoid(f, a.id);

    await expectAppError(voidAs(f, b.id, { approvalId: approvalA }), "APROBACION_INVALIDA", /no corresponde a esta venta/);
    await voidAs(f, a.id, { approvalId: approvalA });
    await expectAppError(voidAs(f, b.id, { approvalId: approvalA }), "APROBACION_INVALIDA", /ya fue usada/);
    expect((await db.sale.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("COMPLETADA");
  });

  it("aprobación vencida o rechazada: la venta no se anula", async () => {
    await openCaja(f);
    const sale = await sale1();
    const { result: req } = await requestVoidApproval({ actor: f.actors.vendRga, saleId: sale.id, reason: "Se equivocó", idempotencyKey: newKey("sol") });
    await approve(f, req.id);
    await db.approvalRequest.update({ where: { id: req.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    await expectAppError(voidAs(f, sale.id, { approvalId: req.id }), "APROBACION_INVALIDA", /venció/);

    const { result: other } = await requestVoidApproval({ actor: f.actors.vendRga, saleId: sale.id, reason: "Se equivocó", idempotencyKey: newKey("sol") });
    await rejectRequest({ actor: f.actors.belen, requestId: other.id, comment: "No corresponde", idempotencyKey: newKey("rech") });
    await expectAppError(voidAs(f, sale.id, { approvalId: other.id }), "APROBACION_INVALIDA", /rechazó/);
    expect((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe("COMPLETADA");
    expect(await countMovements({ type: "ANULACION_VENTA" })).toBe(0);
  });

  it("una venta de otro día no se anula ni se puede pedir (RN-12)", async () => {
    await openCaja(f);
    const sale = await sale1();
    await db.sale.update({ where: { id: sale.id }, data: { createdAt: new Date(Date.now() - 36 * 3_600_000) } });

    await expectAppError(
      requestVoidApproval({ actor: f.actors.vendRga, saleId: sale.id, reason: "Ayer se equivocó", idempotencyKey: newKey("sol") }),
      "VALIDATION",
      /mismo día/,
    );
    await expectAppError(voidAs(f, sale.id, { actor: f.actors.belen }), "VALIDATION", /mismo día/); // ni el ADMIN
    // Aunque exista una aprobación forjada para esa venta, la regla del día se aplica al anular.
    const { result: forged } = await createApprovalRequest({
      actor: f.actors.vendRga,
      type: "ANULACION",
      locationId: f.loc.TIENDA_RANCAGUA,
      amount: sale.payments.reduce((a, p) => a + p.amount, 0),
      binding: voidBinding(sale.id),
      reason: "Forjada para la prueba",
      display: { headline: "x", lines: [] },
      idempotencyKey: newKey("forjada"),
    });
    await approve(f, forged.id);
    await expectAppError(voidAs(f, sale.id, { approvalId: forged.id }), "VALIDATION", /mismo día/);
    expect((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe("COMPLETADA");
    expect(await countMovements({ type: "ANULACION_VENTA" })).toBe(0);
  });

  it("no se anula dos veces; repetir la clave es idempotente; dos anulaciones simultáneas: una sola", async () => {
    await openCaja(f);
    const pba = await f.variant(PBA_XL);
    const sale = await sale1();
    const approvalId = await approvedVoid(f, sale.id);
    const key = newKey("anular");

    const first = await voidAs(f, sale.id, { approvalId, key });
    const replay = await voidAs(f, sale.id, { approvalId, key });
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    await expectAppError(voidAs(f, sale.id, { actor: f.actors.belen }), "CONFLICT", /ya está anulada/);
    expect(await stockOf(pba, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 5, reserved: 0 });
    expect(await countMovements({ type: "ANULACION_VENTA" })).toBe(1);

    const other = await sale1({}, 1);
    const results = await Promise.allSettled([voidAs(f, other.id, { actor: f.actors.belen }), voidAs(f, other.id, { actor: f.actors.belen })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r): r is PromiseRejectedResult => r.status === "rejected")!.reason as { code: string }).code).toBe("CONFLICT");
    expect(await countMovements({ type: "ANULACION_VENTA" })).toBe(2); // una sola reposición más
    await expectInvariants();
  });

  it("el ADMIN anula directo, sin solicitud, y queda en audit_log", async () => {
    await openCaja(f);
    const pba = await f.variant(PBA_XL);
    const sale = await sale1();
    const { result } = await voidAs(f, sale.id, { actor: f.actors.belen, reason: "Venta duplicada" });

    expect(result.status).toBe("ANULADA");
    expect(result.voided).toMatchObject({ approved: false, byName: "Belén" });
    expect(await db.approvalRequest.count()).toBe(0);
    expect(await stockOf(pba, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 5, reserved: 0 });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "SALE_VOID", entityId: sale.id } });
    expect(audit).toMatchObject({ userId: f.actors.belen.id });
    expect(audit.after).toMatchObject({ direct: true, approvalId: null, reason: "Venta duplicada" });
  });

  it("acceso: BODEGA no anula; las ventas online no se anulan desde Ventas del día; la vendedora no pide por ventas online", async () => {
    await openCaja(f);
    const sale = await sale1();
    await expectAppError(voidAs(f, sale.id, { actor: f.actors.bodega }), "FORBIDDEN");
    expect((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe("COMPLETADA");

    const order = await registerTestOrder(f, [{ sku: PBA_XL }]);
    const { result: paid } = await confirmTestPayment(f, order.id);
    await expectAppError(voidAs(f, paid.sale!.id, { actor: f.actors.belen }), "VALIDATION", /es online/);
    await expectAppError(
      requestVoidApproval({ actor: f.actors.vendRga, saleId: paid.sale!.id, reason: "Quiere anular la online", idempotencyKey: newKey("sol") }),
      "FORBIDDEN",
    ); // la venta online es de la bodega: otra ubicación
  });

  it("aparece en 'Ventas del día' como anulada y no suma a los totales", async () => {
    await openCaja(f);
    const keep = await sale1({}, 1);
    const gone = await sale1({}, 2);
    await voidAs(f, gone.id, { actor: f.actors.belen });

    const day = await listSalesOfDay({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA });
    expect(day.sales.map((s) => [s.id, s.status]).sort()).toEqual([[gone.id, "ANULADA"], [keep.id, "COMPLETADA"]].sort());
    expect(day.count).toBe(1);
    expect(day.totalCollected).toBe(keep.payments.reduce((a, p) => a + p.amount, 0));
  });
});

describe("caja y anulación en efectivo", () => {
  it("en la misma caja: la venta anulada no cuenta y la caja cuadra", async () => {
    const caja = await openCaja(f, 50_000);
    const sale = await sale1({ method: "EFECTIVO" }); // 2 × $8.990 = $17.980 en efectivo
    const cashPaid = sale.payments[0].amount;
    expect(await expectedCashNow(f, caja.id)).toBe(50_000 + cashPaid);

    await voidAs(f, sale.id, { approvalId: await approvedVoid(f, sale.id) });

    const totals = await getCashClosingTotals(f.actors.vendRga, caja.id);
    expect(totals).toMatchObject({ salesCount: 0, cashCollected: 0, cashRefunded: 0, expectedCash: 50_000 });
    const closed = await closeCajaExact(f, caja.id);
    expect(closed).toMatchObject({ expectedCash: 50_000, difference: 0 });
  });

  it("venta de una caja ya cerrada anulada con otra abierta: el efectivo sale de la abierta", async () => {
    const caja1 = await openCaja(f, 50_000);
    const sale = await sale1({ method: "EFECTIVO" });
    const cashPaid = sale.payments[0].amount;
    await closeCajaExact(f, caja1.id);

    const caja2 = await openCaja(f, 30_000);
    await voidAs(f, sale.id, { approvalId: await approvedVoid(f, sale.id) });

    expect((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).voidCashSessionId).toBe(caja2.id);
    const totals = await getCashClosingTotals(f.actors.vendRga, caja2.id);
    expect(totals).toMatchObject({ cashRefunded: cashPaid, expectedCash: 30_000 - cashPaid });
    expect(await closeCajaExact(f, caja2.id)).toMatchObject({ difference: 0 });
    // La caja 1 ya cerrada conserva lo que se calculó al cerrarla.
    expect((await db.cashSession.findUniqueOrThrow({ where: { id: caja1.id } })).expectedCash).toBe(50_000 + cashPaid);
  });

  it("una venta en efectivo no se anula sin caja abierta; una con tarjeta sí", async () => {
    const caja = await openCaja(f);
    const cash = await sale1({ method: "EFECTIVO" }, 1);
    const card = await sale1({}, 1);
    await closeCajaExact(f, caja.id);

    const approvalCash = await approvedVoid(f, cash.id);
    await expectAppError(voidAs(f, cash.id, { approvalId: approvalCash }), "CONFLICT", /abre la caja/);
    expect((await db.sale.findUniqueOrThrow({ where: { id: cash.id } })).status).toBe("COMPLETADA");
    expect((await db.approvalRequest.findUniqueOrThrow({ where: { id: approvalCash } })).status).toBe("APROBADA"); // no se gastó

    const { result } = await voidAs(f, card.id, { approvalId: await approvedVoid(f, card.id) });
    expect(result.status).toBe("ANULADA");
    expect((await db.sale.findUniqueOrThrow({ where: { id: card.id } })).voidCashSessionId).toBeNull();

    // Al abrir una caja ya se puede anular la de efectivo, con la misma aprobación.
    await openCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, openingCash: 20_000 });
    expect((await voidAs(f, cash.id, { approvalId: approvalCash })).result.status).toBe("ANULADA");
  });

  it("sale con JMT en efectivo y vuelto: se descuenta lo cobrado (neto de vuelto)", async () => {
    const caja = await openCaja(f, 10_000);
    const { result: sale } = await sellWith(f, [{ sku: JMT_AZU, qty: 1 }], { method: "EFECTIVO" }); // se entregan $100.000
    const net = sale.payments[0].amount; // neto de vuelto
    expect(net).toBe(29_990 + sale.roundingAdjustment);
    await voidAs(f, sale.id, { actor: f.actors.belen });
    expect(await expectedCashNow(f, caja.id)).toBe(10_000);
  });
});
