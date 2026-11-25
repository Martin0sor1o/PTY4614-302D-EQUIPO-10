import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { approveRequest, rejectRequest } from "@/modules/approvals";
import { requestReturnApproval } from "@/modules/returns";
import { requestVoidApproval } from "@/modules/sales";
import { expectAppError, newKey, resetDemo, type Fixtures } from "./helpers";
import {
  ageSale,
  approvedReturn,
  cambio,
  DINERO_EFECTIVO,
  DINERO_TRANSFERENCIA,
  doReturn,
  JMT_AZU,
  openCaja,
  PBA_XL,
  sellPos,
  toLines,
  VALE,
  type ReturnSpec,
  type SoldSale,
} from "./returns-helpers";
import type { ReturnResolutionInput } from "@/modules/returns";

// Aprobaciones de devoluciones (ADR-014 + ADR-021): hash vinculante (venta + prendas + destino + prendas nuevas), un solo uso,
// mismo tipo, ubicación y monto. Belén (ADMIN) opera directo, sin solicitud.

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const store = () => f.loc.TIENDA_RANCAGUA;

const ask = (sale: SoldSale, specs: ReturnSpec[], resolution: ReturnResolutionInput, extra: { actor?: Fixtures["actors"]["vendRga"]; locationId?: string } = {}) =>
  requestReturnApproval({
    actor: extra.actor ?? f.actors.vendRga,
    locationId: extra.locationId ?? store(),
    saleId: sale.saleId,
    lines: toLines(sale, specs),
    resolution,
    reason: "FALLA",
    reasonNote: "Se descosió",
    idempotencyKey: newKey("sol"),
  });

const status = async (id: string) => (await db.approvalRequest.findUniqueOrThrow({ where: { id } })).status;

describe("reembolso en dinero (RN-15): la vendedora necesita a Belén", () => {
  it("sin aprobación se bloquea con el tipo REEMBOLSO; con la aprobación se ejecuta y la aprobación queda USADA ligada a la devolución", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }], { method: "EFECTIVO" });
    const e = await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], DINERO_EFECTIVO), "APROBACION_REQUERIDA", /Reembolso en dinero/);
    expect(e.details?.approvalType).toBe("REEMBOLSO");

    const approvalId = await approvedReturn(f, sale, [{ sku: PBA_XL }], DINERO_EFECTIVO);
    const { result } = await doReturn(f, sale, [{ sku: PBA_XL }], DINERO_EFECTIVO, { approvalId });
    expect(result.approvalId).toBe(approvalId);
    const a = await db.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } });
    expect(a).toMatchObject({ status: "USADA", usedRefType: "RETURN", usedRefId: result.id, type: "REEMBOLSO", amount: 8_990 });
  });

  it("la solicitud muestra a Belén la venta, las prendas, el destino y por qué necesita su aprobación", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    const { result: req } = await ask(sale, [{ sku: PBA_XL, condition: "DANADA" }], DINERO_TRANSFERENCIA);
    expect(req.type).toBe("REEMBOLSO");
    expect(req.amount).toBe(8_990);
    expect(req.reason).toBe("Falla: Se descosió");
    expect(req.display.headline).toContain(sale.number);
    const text = JSON.stringify(req.display);
    expect(text).toContain("Reembolso en dinero (RN-15)");
    expect(text).toContain("dañada (merma)");
    expect(text).toContain(PBA_XL);
  });

  it("Belén (ADMIN) devuelve en dinero directo, sin solicitud, y queda en audit_log", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }], { method: "EFECTIVO" });
    const { result } = await doReturn(f, sale, [{ sku: PBA_XL }], DINERO_EFECTIVO, { actor: f.actors.belen });
    expect(result.approvalId).toBeNull();
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "RETURN_CREATE", entityId: result.id } });
    expect(audit.userId).toBe(f.actors.belen.id);
    expect(audit.after).toMatchObject({ direct: true, refundMethod: "EFECTIVO", refundAmount: 8_990 });
    expect(await db.approvalRequest.count()).toBe(0);
  });
});

describe("la aprobación es de un solo uso y está amarrada a lo aprobado", () => {
  it("una aprobación ya usada no sirve otra vez", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }], { method: "EFECTIVO" });
    const approvalId = await approvedReturn(f, sale, [{ sku: PBA_XL }], DINERO_EFECTIVO);
    await doReturn(f, sale, [{ sku: PBA_XL }], DINERO_EFECTIVO, { approvalId });
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], DINERO_EFECTIVO, { approvalId }), "APROBACION_INVALIDA", /ya fue usada/);
    expect(await db.return.count()).toBe(1);
  });

  it("no sirve para otras prendas, otra cantidad, otro destino ni otra venta (el hash no coincide)", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }, { sku: JMT_AZU }], { method: "EFECTIVO" });
    const other = await sellPos(f, [{ sku: PBA_XL }], { method: "EFECTIVO" });
    const approvalId = await approvedReturn(f, sale, [{ sku: PBA_XL }], DINERO_TRANSFERENCIA);
    // otras prendas
    await expectAppError(doReturn(f, sale, [{ sku: JMT_AZU }], DINERO_TRANSFERENCIA, { approvalId }), "APROBACION_INVALIDA", /cambió después de la aprobación/);
    // otra cantidad
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL, qty: 2 }], DINERO_TRANSFERENCIA, { approvalId }), "APROBACION_INVALIDA");
    // otro medio de reembolso (transferencia aprobada, efectivo ejecutado)
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], DINERO_EFECTIVO, { approvalId }), "APROBACION_INVALIDA");
    // otra condición de la prenda
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL, condition: "DANADA" }], DINERO_TRANSFERENCIA, { approvalId }), "APROBACION_INVALIDA");
    // otra venta
    await expectAppError(doReturn(f, other, [{ sku: PBA_XL }], DINERO_TRANSFERENCIA, { approvalId }), "APROBACION_INVALIDA");
    // nada se consumió y nada se devolvió
    expect(await status(approvalId)).toBe("APROBADA");
    expect(await db.return.count()).toBe(0);
    // y con lo aprobado exacto, sí
    await doReturn(f, sale, [{ sku: PBA_XL }], DINERO_TRANSFERENCIA, { approvalId });
    expect(await status(approvalId)).toBe("USADA");
  });

  it("una aprobación de otro tipo (anulación) no sirve para una devolución", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    const { result: req } = await requestVoidApproval({ actor: f.actors.vendRga, saleId: sale.saleId, reason: "Error al cobrar", idempotencyKey: newKey("sol") });
    await approveRequest({ actor: f.actors.belen, requestId: req.id, idempotencyKey: newKey("ap") });
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], DINERO_TRANSFERENCIA, { approvalId: req.id }), "APROBACION_INVALIDA", /otro tipo|no corresponde a este tipo/);
  });

  it("pendiente → 'Belén todavía no responde'; rechazada → inválida; inexistente → inválida", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    const { result: pending } = await ask(sale, [{ sku: PBA_XL }], DINERO_TRANSFERENCIA);
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], DINERO_TRANSFERENCIA, { approvalId: pending.id }), "APROBACION_REQUERIDA", /todavía no responde/);
    await rejectRequest({ actor: f.actors.belen, requestId: pending.id, idempotencyKey: newKey("rech") });
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], DINERO_TRANSFERENCIA, { approvalId: pending.id }), "APROBACION_INVALIDA", /rechazó/);
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], DINERO_TRANSFERENCIA, { approvalId: "no-existe" }), "APROBACION_INVALIDA", /no existe/);
  });

  it("una aprobación vencida no sirve", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    const approvalId = await approvedReturn(f, sale, [{ sku: PBA_XL }], DINERO_TRANSFERENCIA);
    await db.$executeRaw`UPDATE approval_requests SET expires_at = now() - interval '1 minute' WHERE id = ${approvalId}`;
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], DINERO_TRANSFERENCIA, { approvalId }), "APROBACION_INVALIDA", /venció/);
  });

  it("si la operación falla DESPUÉS de consumir la aprobación, todo se revierte y la aprobación sigue disponible", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await ageSale(sale.saleId, 45); // fuera de plazo: pide CAMBIO_FUERA_PLAZO
    const noPay = await cambio(f, [{ sku: JMT_AZU }]); // falta el medio de pago de la diferencia: falla al vender, tras consumir
    const approvalId = await approvedReturn(f, sale, [{ sku: PBA_XL }], noPay);
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], noPay, { approvalId }), "VALIDATION", /elige un medio de pago/);
    expect(await status(approvalId)).toBe("APROBADA");
    expect((await db.saleLine.findFirstOrThrow({ where: { id: sale.line[PBA_XL] } })).returnedQuantity).toBe(0);
    // reintento con el pago: la misma aprobación ahora sí
    const withPay = await cambio(f, [{ sku: JMT_AZU }], { method: "DEBITO", reference: "V-1" });
    const approvalOk = await approvedReturn(f, sale, [{ sku: PBA_XL }], withPay);
    const { result } = await doReturn(f, sale, [{ sku: PBA_XL }], withPay, { approvalId: approvalOk });
    expect(result.type).toBe("CAMBIO");
  });

  it("el cambio fuera de plazo queda amarrado a las prendas nuevas: otra prenda nueva invalida la aprobación", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await ageSale(sale.saleId, 45);
    const approved = await cambio(f, [{ sku: JMT_AZU }], { method: "DEBITO", reference: "V-1" });
    const approvalId = await approvedReturn(f, sale, [{ sku: PBA_XL }], approved);
    const different = await cambio(f, [{ sku: PBA_XL }]);
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], different, { approvalId }), "APROBACION_INVALIDA");
    const { result } = await doReturn(f, sale, [{ sku: PBA_XL }], approved, { approvalId });
    expect(result.newSale).not.toBeNull();
  });

  it("si Belén dejó una aprobación pero ya no hace falta, no se consume", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    // devolución a vale dentro de regla: no requiere aprobación; una aprobación cualquiera que se mande se ignora
    const { result } = await doReturn(f, sale, [{ sku: PBA_XL }], VALE, { approvalId: "cualquiera" });
    expect(result.approvalId).toBeNull();
  });
});

describe("pedir la aprobación", () => {
  it("solo una VENDEDORA la pide; Belén no necesita pedirla", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await expectAppError(ask(sale, [{ sku: PBA_XL }], DINERO_TRANSFERENCIA, { actor: f.actors.belen as never }), "FORBIDDEN");
  });

  it("si la devolución no necesita aprobación, pedirla es un error", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await expectAppError(ask(sale, [{ sku: PBA_XL }], VALE), "VALIDATION", /no necesita la aprobación/);
  });

  it("es idempotente: la misma clave devuelve la misma solicitud", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    const key = newKey("sol");
    const run = () =>
      requestReturnApproval({ actor: f.actors.vendRga, locationId: store(), saleId: sale.saleId, lines: toLines(sale, [{ sku: PBA_XL }]), resolution: DINERO_TRANSFERENCIA, reason: "FALLA", idempotencyKey: key });
    const a = await run();
    const b = await run();
    expect(b.replayed).toBe(true);
    expect(b.result.id).toBe(a.result.id);
    expect(await db.approvalRequest.count()).toBe(1);
  });
});
