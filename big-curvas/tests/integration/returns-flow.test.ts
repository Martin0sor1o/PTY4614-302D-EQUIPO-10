import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createReturn, getSaleForReturn, quoteReturn, searchSalesForReturn } from "@/modules/returns";
import { voidSale } from "@/modules/sales";
import { findVoucherLedgerMismatches } from "@/modules/vouchers";
import { dispatchOrder } from "@/modules/orders";
import { expectAppError, expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";
import { confirmTestPayment, prepareTestOrder, registerTestOrder } from "./orders-helpers";
import {
  ageSale,
  approvedReturn,
  cambio,
  DINERO_TRANSFERENCIA,
  doReturn,
  insertVoucher,
  JMT_AZU,
  lineIds,
  openCaja,
  PBA_XL,
  sellPos,
  setSetting,
  toLines,
  VALE,
  type SoldSale,
} from "./returns-helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const store = () => f.loc.TIENDA_RANCAGUA;
const stock = async (sku: string, loc = store()) => (await stockOf(await f.variant(sku), loc)).onHand;
const movementsOf = (returnId: string) => db.inventoryMovement.findMany({ where: { refType: "RETURN", refId: returnId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });

/** Pedido online llevado hasta DESPACHADO: devuelve su venta (canal INSTAGRAM, ubicación BODEGA). */
async function dispatchedOnlineSale(sku = PBA_XL): Promise<SoldSale> {
  const order = await registerTestOrder(f, [{ sku }]);
  await confirmTestPayment(f, order.id);
  await prepareTestOrder(f, order);
  await dispatchOrder({ actor: f.actors.belen, orderId: order.id, courier: "Starken", trackingNumber: "STK-1", idempotencyKey: newKey("d") });
  const sale = await db.sale.findUniqueOrThrow({ where: { onlineOrderId: order.id } });
  return { saleId: sale.id, number: sale.number, total: sale.total, line: await lineIds(f, sale.id, [sku]) };
}

describe("devolución a vale (RF-DEV-01, RF-DEV-04, RF-DEV-06)", () => {
  it("la prenda vuelve al stock de la tienda, se emite el vale por lo pagado y queda todo trazado", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }]);
    expect(await stock(PBA_XL)).toBe(3);

    const { result: r, replayed } = await doReturn(f, sale, [{ sku: PBA_XL, qty: 1 }], VALE, { reason: "TALLA" });
    expect(replayed).toBe(false);
    expect(r).toMatchObject({ type: "DEVOLUCION", refundMethod: "VALE", refundAmount: 0, valueReturned: 8_990, reason: "TALLA", approvalId: null, newSale: null });
    expect(r.number).toMatch(/^DEV-\d{6}$/);
    expect(r.voucher).toMatchObject({ initialAmount: 8_990, balance: 8_990 });
    expect(r.voucher!.code).toMatch(/^VAL-/);
    expect(r.lines).toEqual([expect.objectContaining({ sku: PBA_XL, qty: 1, amount: 8_990, condition: "VENDIBLE" })]);

    expect(await stock(PBA_XL)).toBe(4);
    const moves = await movementsOf(r.id);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ type: "DEVOLUCION", quantity: 1, locationId: store(), userId: f.actors.vendRga.id });
    expect((await db.saleLine.findFirstOrThrow({ where: { id: sale.line[PBA_XL] } })).returnedQuantity).toBe(1);

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "RETURN_CREATE", entityId: r.id } });
    expect(audit.userId).toBe(f.actors.vendRga.id);
    expect(audit.after).toMatchObject({ valueReturned: 8_990, destination: "VALE", direct: false });
    expect(JSON.stringify(audit)).not.toContain(r.voucher!.code); // el código del vale no va a audit_log
    expect(await findVoucherLedgerMismatches()).toEqual([]);
    await expectInvariants();
  });

  it("la devolución del vale queda ligada a la venta y a la vendedora; la venta original sigue COMPLETADA", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    const { result: r } = await doReturn(f, sale, [{ sku: PBA_XL }], VALE);
    expect(r.sale).toEqual({ id: sale.saleId, number: sale.number });
    expect(r.userName).toBe((await db.user.findUniqueOrThrow({ where: { id: f.actors.vendRga.id } })).name);
    expect((await db.sale.findUniqueOrThrow({ where: { id: sale.saleId } })).status).toBe("COMPLETADA");
  });
});

describe("prenda dañada (RN-11, S-03)", () => {
  it("entra y sale como merma: el stock queda igual y el ledger tiene DEVOLUCION y MERMA", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    const before = await stock(PBA_XL);
    const { result: r } = await doReturn(f, sale, [{ sku: PBA_XL, condition: "DANADA" }], VALE, { reason: "FALLA" });
    expect(await stock(PBA_XL)).toBe(before);
    const moves = await movementsOf(r.id);
    expect(moves.map((m) => [m.type, m.quantity])).toEqual([["DEVOLUCION", 1], ["MERMA", -1]]);
    expect(r.lines[0].condition).toBe("DANADA");
    await expectInvariants();
  });

  it("mezcla en una misma devolución: solo lo dañado va a merma", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }, { sku: JMT_AZU }]);
    const beforeP = await stock(PBA_XL);
    const beforeJ = await stock(JMT_AZU);
    const { result: r } = await doReturn(f, sale, [{ sku: PBA_XL }, { sku: JMT_AZU, condition: "DANADA" }], VALE);
    expect(await stock(PBA_XL)).toBe(beforeP + 1); // vendible: vuelve al stock
    expect(await stock(JMT_AZU)).toBe(beforeJ); // dañada: neto 0
    expect((await movementsOf(r.id)).filter((m) => m.type === "MERMA")).toHaveLength(1);
  });
});

describe("no sobre-devolver (RF-DEV-05)", () => {
  it("devolver más de lo vendido se rechaza y no deja nada", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL, qty: 2 }], VALE), "CONFLICT", /solo se pueden devolver 1 más/);
    expect(await db.return.count()).toBe(0);
    expect(await db.voucher.count()).toBe(0);
    expect((await db.saleLine.findFirstOrThrow({ where: { id: sale.line[PBA_XL] } })).returnedQuantity).toBe(0);
    await expectInvariants();
  });

  it("devolver en partes: cantidad ≤ vendida − ya devuelta; la tercera parte ya no cabe", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 3 }]);
    await doReturn(f, sale, [{ sku: PBA_XL, qty: 2 }], VALE);
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL, qty: 2 }], VALE), "CONFLICT", /solo se pueden devolver 1 más/);
    await doReturn(f, sale, [{ sku: PBA_XL, qty: 1 }], VALE);
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], VALE), "CONFLICT", /ya se devolvió completo/);
    const line = await db.saleLine.findFirstOrThrow({ where: { id: sale.line[PBA_XL] } });
    expect(line.returnedQuantity).toBe(3);
    const sum = await db.returnLine.aggregate({ where: { saleLineId: line.id }, _sum: { quantity: true } });
    expect(sum._sum.quantity).toBe(line.returnedQuantity); // returned_quantity = Σ return_lines
  });

  it("con descuento en la línea se devuelve lo PAGADO y la suma de las partes es exactamente el total", async () => {
    await openCaja(f);
    // Belén vende con 33,33 % de descuento (la vendedora tiene límite 0 %): 3 × $8.990 = $26.970 − $8.989 = $17.981
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 3, discountBps: 3333 }], { actor: f.actors.belen });
    const lineTotal = (await db.saleLine.findFirstOrThrow({ where: { id: sale.line[PBA_XL] } })).lineTotal;
    expect(lineTotal).toBe(17_981);
    const amounts: number[] = [];
    for (let i = 0; i < 3; i++) {
      const { result } = await doReturn(f, sale, [{ sku: PBA_XL }], VALE);
      amounts.push(result.valueReturned);
    }
    expect(amounts).toEqual([5_993, 5_994, 5_994]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(lineTotal);
  });
});

describe("reglas de la venta (S-02)", () => {
  it("una venta anulada no se devuelve", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await voidSale({ actor: f.actors.belen, saleId: sale.saleId, reason: "Error al cobrar", idempotencyKey: newKey("anular") });
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], VALE), "CONFLICT", /anulada/);
  });

  it("una venta que no existe → NOT_FOUND", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await expectAppError(doReturn(f, { ...sale, saleId: "no-existe" }, [{ sku: PBA_XL }], VALE), "NOT_FOUND");
  });

  it("una línea que no es de esa venta, o repetida, se rechaza", async () => {
    await openCaja(f);
    const a = await sellPos(f, [{ sku: PBA_XL }]);
    const b = await sellPos(f, [{ sku: JMT_AZU }]);
    await expectAppError(
      createReturn({ actor: f.actors.vendRga, locationId: store(), saleId: a.saleId, lines: toLines(b, [{ sku: JMT_AZU }]), reason: "TALLA", resolution: VALE, idempotencyKey: newKey("d") }),
      "VALIDATION",
      /no pertenece/,
    );
    await expectAppError(
      createReturn({ actor: f.actors.vendRga, locationId: store(), saleId: a.saleId, lines: [...toLines(a, [{ sku: PBA_XL }]), ...toLines(a, [{ sku: PBA_XL }])], reason: "TALLA", resolution: VALE, idempotencyKey: newKey("d") }),
      "VALIDATION",
      /dos veces/,
    );
  });

  it("el motivo 'Otro' exige una nota; los demás no", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }]);
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], VALE, { reason: "OTRO" }), "VALIDATION", /motivo/);
    const { result } = await doReturn(f, sale, [{ sku: PBA_XL }], VALE, { reason: "OTRO", reasonNote: "Le quedó muy apretado" });
    expect(result.reasonNote).toBe("Le quedó muy apretado");
  });

  it("S-07: lo pagado con vale no se devuelve en dinero, pero sí en vale o cambio", async () => {
    await openCaja(f);
    const paid = await insertVoucher(f, { code: "VAL-VENT-AVAL-0001", amount: 20_000 });
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }], { voucherCode: paid.code });
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], DINERO_TRANSFERENCIA, { actor: f.actors.belen }), "VALIDATION", /pagó \(en parte\) con vale/);
    const { result } = await doReturn(f, sale, [{ sku: PBA_XL }], VALE);
    expect(result.refundMethod).toBe("VALE");
  });
});

describe("plazo de cambio y devolución (RN-10, S-01)", () => {
  it("dentro del plazo (30 días) la vendedora devuelve a vale sola; al día 31 necesita la aprobación (CAMBIO_FUERA_PLAZO)", async () => {
    await openCaja(f);
    const ok = await sellPos(f, [{ sku: PBA_XL }]);
    await ageSale(ok.saleId, 30);
    await doReturn(f, ok, [{ sku: PBA_XL }], VALE);

    const late = await sellPos(f, [{ sku: PBA_XL }]);
    await ageSale(late.saleId, 31);
    const error = await expectAppError(doReturn(f, late, [{ sku: PBA_XL }], VALE), "APROBACION_REQUERIDA", /Fuera de plazo/);
    expect(error.details?.approvalType).toBe("CAMBIO_FUERA_PLAZO");

    const approvalId = await approvedReturn(f, late, [{ sku: PBA_XL }], VALE);
    expect((await db.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } })).type).toBe("CAMBIO_FUERA_PLAZO");
    const { result } = await doReturn(f, late, [{ sku: PBA_XL }], VALE, { approvalId });
    expect(result.approvalId).toBe(approvalId);
  });

  it("el plazo es configurable en settings.return_window_days", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await ageSale(sale.saleId, 15);
    await doReturn(f, sale, [{ sku: PBA_XL }], VALE); // 15 días < 30: sin aprobación
    await setSetting("return_window_days", 10);
    const other = await sellPos(f, [{ sku: PBA_XL }]);
    await ageSale(other.saleId, 15);
    await expectAppError(doReturn(f, other, [{ sku: PBA_XL }], VALE), "APROBACION_REQUERIDA", /Fuera de plazo/);
  });

  it("Belén (ADMIN) devuelve fuera de plazo sin solicitud y queda en audit_log como directa", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await ageSale(sale.saleId, 90);
    const { result } = await doReturn(f, sale, [{ sku: PBA_XL }], VALE, { actor: f.actors.belen });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "RETURN_CREATE", entityId: result.id } });
    expect(audit.userId).toBe(f.actors.belen.id);
    expect(audit.after).toMatchObject({ direct: true, outOfWindow: true, approvalId: null });
  });
});

describe("tope del vale de la vendedora (S-08)", () => {
  it("un vale sobre el tope pide VALE_SOBRE_TOPE; justo en el tope, no", async () => {
    await openCaja(f);
    await setSetting("voucher_seller_cap", 8_990);
    const a = await sellPos(f, [{ sku: PBA_XL }]);
    await doReturn(f, a, [{ sku: PBA_XL }], VALE); // $8.990 = tope: sola
    await setSetting("voucher_seller_cap", 8_989);
    const b = await sellPos(f, [{ sku: PBA_XL }]);
    const e = await expectAppError(doReturn(f, b, [{ sku: PBA_XL }], VALE), "APROBACION_REQUERIDA", /sobre el tope/);
    expect(e.details?.approvalType).toBe("VALE_SOBRE_TOPE");
    const approvalId = await approvedReturn(f, b, [{ sku: PBA_XL }], VALE);
    await doReturn(f, b, [{ sku: PBA_XL }], VALE, { approvalId });
    expect((await db.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } })).type).toBe("VALE_SOBRE_TOPE");
  });

  it("Belén no tiene tope", async () => {
    await openCaja(f);
    await setSetting("voucher_seller_cap", 1_000);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await doReturn(f, sale, [{ sku: PBA_XL }], VALE, { actor: f.actors.belen });
  });
});

describe("cambio (RF-DEV-02, S-05)", () => {
  it("diferencia a pagar: el valor devuelto se canjea como vale y la diferencia va con un medio de pago", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]); // $8.990
    const xP = await stock(PBA_XL);
    const xJ = await stock(JMT_AZU);
    const { result: r } = await doReturn(f, sale, [{ sku: PBA_XL }], await cambio(f, [{ sku: JMT_AZU }], { method: "DEBITO", reference: "V-55" }), { reason: "TALLA" });

    expect(r).toMatchObject({ type: "CAMBIO", refundMethod: "NINGUNO", refundAmount: 0, valueReturned: 8_990 });
    expect(r.newSale).toMatchObject({ total: 29_990 });
    const pays = await db.payment.findMany({ where: { saleId: r.newSale!.id }, orderBy: { amount: "asc" } });
    expect(pays.map((p) => [p.method, p.amount])).toEqual([["VALE", 8_990], ["DEBITO", 21_000]]);
    expect(r.voucher).toMatchObject({ initialAmount: 8_990, balance: 0 }); // se canjeó entero: no queda saldo
    expect(await stock(PBA_XL)).toBe(xP + 1); // lo devuelto entra a la tienda
    expect(await stock(JMT_AZU)).toBe(xJ - 1); // lo nuevo sale de la tienda
    expect((await movementsOf(r.id)).map((m) => m.type)).toEqual(["DEVOLUCION"]);
    expect(await findVoucherLedgerMismatches()).toEqual([]);
    await expectInvariants();
  });

  it("diferencia a favor: lo que sobra queda en el vale (no se devuelve en dinero)", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: JMT_AZU }]); // $29.990
    const { result: r } = await doReturn(f, sale, [{ sku: JMT_AZU }], await cambio(f, [{ sku: PBA_XL }]), { reason: "NO_ES_LO_ESPERADO" });
    expect(r.newSale!.total).toBe(8_990);
    expect(r.voucher).toMatchObject({ initialAmount: 29_990, balance: 21_000 });
    expect(r.refundAmount).toBe(0);
    const pays = await db.payment.findMany({ where: { saleId: r.newSale!.id } });
    expect(pays.map((p) => [p.method, p.amount])).toEqual([["VALE", 8_990]]);
    const ledger = await db.voucherMovement.findMany({ where: { voucherId: r.voucher!.id }, orderBy: { createdAt: "asc" } });
    expect(ledger.map((m) => [m.type, m.amount, m.balanceAfter])).toEqual([["EMISION", 29_990, 29_990], ["CANJE", -8_990, 21_000]]);
    expect(await findVoucherLedgerMismatches()).toEqual([]);
  });

  it("mismo valor: sin diferencia ni saldo", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    const { result: r } = await doReturn(f, sale, [{ sku: PBA_XL }], await cambio(f, [{ sku: PBA_XL }]));
    expect(r.voucher!.balance).toBe(0);
    expect(r.newSale!.total).toBe(8_990);
  });

  it("si falta el medio de pago de la diferencia, todo se revierte (devolución, vale, venta y stock)", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    const before = { p: await stock(PBA_XL), j: await stock(JMT_AZU) };
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], await cambio(f, [{ sku: JMT_AZU }])), "VALIDATION", /elige un medio de pago/);
    expect(await db.return.count()).toBe(0);
    expect(await db.voucher.count()).toBe(0);
    expect(await db.sale.count()).toBe(1); // solo la venta original
    expect({ p: await stock(PBA_XL), j: await stock(JMT_AZU) }).toEqual(before);
    expect((await db.saleLine.findFirstOrThrow({ where: { id: sale.line[PBA_XL] } })).returnedQuantity).toBe(0);
    await expectInvariants();
  });

  it("si la prenda nueva no tiene stock, se revierte todo", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], await cambio(f, [{ sku: "JMT012-NEG-48" }], { method: "DEBITO", reference: "V-1" })), "STOCK_INSUFICIENTE");
    expect(await db.return.count()).toBe(0);
    expect(await stock(PBA_XL)).toBe(4);
    await expectInvariants();
  });

  it("un saldo a favor sobre el tope de la vendedora pide VALE_SOBRE_TOPE", async () => {
    await openCaja(f);
    await setSetting("voucher_seller_cap", 20_000);
    const sale = await sellPos(f, [{ sku: JMT_AZU }]);
    const res = await cambio(f, [{ sku: PBA_XL }]); // saldo a favor $21.000 > $20.000
    const e = await expectAppError(doReturn(f, sale, [{ sku: JMT_AZU }], res), "APROBACION_REQUERIDA");
    expect(e.details?.approvalType).toBe("VALE_SOBRE_TOPE");
  });

  it("el cambio se hace en la tienda: en la bodega solo hay devoluciones (S-10)", async () => {
    const sale = await dispatchedOnlineSale();
    await expectAppError(
      doReturn(f, sale, [{ sku: PBA_XL }], await cambio(f, [{ sku: JMT_AZU }]), { actor: f.actors.belen, locationId: f.loc.BODEGA }),
      "VALIDATION",
      /no vende al público/,
    );
  });
});

describe("pedidos online (RF-DEV-07, RN-24)", () => {
  it("un pedido despachado se devuelve en la tienda: la prenda entra al stock de la tienda, no al de la bodega", async () => {
    await openCaja(f);
    const sale = await dispatchedOnlineSale();
    const storeBefore = await stock(PBA_XL);
    const bodegaBefore = await stock(PBA_XL, f.loc.BODEGA);
    const { result: r } = await doReturn(f, sale, [{ sku: PBA_XL }], VALE, { reason: "ARREPENTIMIENTO" });
    expect(r.location.id).toBe(store());
    expect(await stock(PBA_XL)).toBe(storeBefore + 1);
    expect(await stock(PBA_XL, f.loc.BODEGA)).toBe(bodegaBefore);
    await expectInvariants();
  });

  it("Belén registra la devolución por courier en la BODEGA: reembolso por transferencia, y entra al stock de la bodega", async () => {
    const sale = await dispatchedOnlineSale();
    const bodegaBefore = await stock(PBA_XL, f.loc.BODEGA);
    const { result: r } = await doReturn(f, sale, [{ sku: PBA_XL }], DINERO_TRANSFERENCIA, { actor: f.actors.belen, locationId: f.loc.BODEGA });
    expect(r).toMatchObject({ refundMethod: "TRANSFERENCIA", refundAmount: 8_990, refundReference: "TRF-9001", location: { id: f.loc.BODEGA } });
    expect(await stock(PBA_XL, f.loc.BODEGA)).toBe(bodegaBefore + 1);
    expect(r.approvalId).toBeNull();
  });

  it("el envío cobrado no se devuelve (S-04): solo el valor de las prendas", async () => {
    const order = await registerTestOrder(f, [{ sku: PBA_XL }], { shippingCost: 3_990 });
    await confirmTestPayment(f, order.id);
    await prepareTestOrder(f, order);
    await dispatchOrder({ actor: f.actors.belen, orderId: order.id, courier: "Starken", trackingNumber: "STK-1", idempotencyKey: newKey("d") });
    const s = await db.sale.findUniqueOrThrow({ where: { onlineOrderId: order.id } });
    expect(s.total).toBe(8_990 + 3_990);
    const sale: SoldSale = { saleId: s.id, number: s.number, total: s.total, line: await lineIds(f, s.id, [PBA_XL]) };
    const { result } = await doReturn(f, sale, [{ sku: PBA_XL }], DINERO_TRANSFERENCIA, { actor: f.actors.belen, locationId: f.loc.BODEGA });
    expect(result.refundAmount).toBe(8_990);
  });

  it("un pedido que todavía no se despacha se cancela, no se devuelve", async () => {
    const order = await registerTestOrder(f, [{ sku: PBA_XL }]);
    await confirmTestPayment(f, order.id);
    const s = await db.sale.findUniqueOrThrow({ where: { onlineOrderId: order.id } });
    const sale: SoldSale = { saleId: s.id, number: s.number, total: s.total, line: await lineIds(f, s.id, [PBA_XL]) };
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], VALE, { actor: f.actors.belen }), "VALIDATION", /todavía no se despacha/);
  });

  it("en la bodega no hay caja: el efectivo se rechaza; la transferencia exige referencia", async () => {
    const sale = await dispatchedOnlineSale();
    await expectAppError(
      doReturn(f, sale, [{ sku: PBA_XL }], { kind: "DINERO", method: "EFECTIVO" }, { actor: f.actors.belen, locationId: f.loc.BODEGA }),
      "VALIDATION",
      /no tiene caja/,
    );
    await expectAppError(
      doReturn(f, sale, [{ sku: PBA_XL }], { kind: "DINERO", method: "TRANSFERENCIA" }, { actor: f.actors.belen, locationId: f.loc.BODEGA }),
      "VALIDATION",
      /N° de la transferencia/,
    );
  });
});

describe("idempotencia (regla 8)", () => {
  it("el doble envío con la misma clave hace UNA sola devolución, un solo vale y un solo movimiento de stock", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }]);
    const key = newKey("devolucion");
    const a = await doReturn(f, sale, [{ sku: PBA_XL }], VALE, { key });
    const b = await doReturn(f, sale, [{ sku: PBA_XL }], VALE, { key });
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(true);
    expect(b.result.id).toBe(a.result.id);
    expect(b.result.voucher!.code).toBe(a.result.voucher!.code);
    expect(await db.return.count()).toBe(1);
    expect(await db.voucher.count()).toBe(1);
    expect(await db.inventoryMovement.count({ where: { refType: "RETURN" } })).toBe(1);
    expect((await db.saleLine.findFirstOrThrow({ where: { id: sale.line[PBA_XL] } })).returnedQuantity).toBe(1);
  });

  it("el doble envío de un CAMBIO tampoco duplica la venta nueva", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    const key = newKey("cambio");
    const res = await cambio(f, [{ sku: JMT_AZU }], { method: "DEBITO", reference: "V-9" });
    const a = await doReturn(f, sale, [{ sku: PBA_XL }], res, { key });
    const b = await doReturn(f, sale, [{ sku: PBA_XL }], res, { key });
    expect(b.replayed).toBe(true);
    expect(b.result.newSale!.id).toBe(a.result.newSale!.id);
    expect(await db.sale.count()).toBe(2);
  });

  it("la misma clave usada con otra venta es un CONFLICT", async () => {
    await openCaja(f);
    const a = await sellPos(f, [{ sku: PBA_XL }]);
    const b = await sellPos(f, [{ sku: JMT_AZU }]);
    const key = newKey("devolucion");
    await doReturn(f, a, [{ sku: PBA_XL }], VALE, { key });
    await expectAppError(doReturn(f, b, [{ sku: JMT_AZU }], VALE, { key }), "CONFLICT", /otra devolución/);
  });
});

describe("cotizar y buscar (RF-DEV-01)", () => {
  it("quoteReturn calcula el resumen sin tocar nada", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }]);
    const q = await quoteReturn({ actor: f.actors.vendRga, locationId: store(), saleId: sale.saleId, lines: toLines(sale, [{ sku: PBA_XL, qty: 2 }]), resolution: DINERO_TRANSFERENCIA });
    expect(q).toMatchObject({ valueReturned: 17_980, resolution: "DINERO", outOfWindow: false, voucherCap: 50_000 });
    expect(q.approval).toMatchObject({ required: true, type: "REEMBOLSO" });
    expect(q.refund).toEqual({ method: "TRANSFERENCIA", amount: 17_980, roundingAdjustment: 0 });
    expect(q.binding).toMatch(/^[0-9a-f]{64}$/);
    expect(await db.return.count()).toBe(0);
    expect((await db.saleLine.findFirstOrThrow({ where: { id: sale.line[PBA_XL] } })).returnedQuantity).toBe(0);
  });

  it("el cambio se cotiza con los precios vigentes del servidor", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    const q = await quoteReturn({ actor: f.actors.vendRga, locationId: store(), saleId: sale.saleId, lines: toLines(sale, [{ sku: PBA_XL }]), resolution: await cambio(f, [{ sku: JMT_AZU }]) });
    expect(q.exchange).toMatchObject({ newTotal: 29_990, voucherUsed: 8_990, toPay: 21_000, leftover: 0 });
    expect(q.approval.required).toBe(false);
  });

  it("busca por parte del N° y sin texto lista las ventas recientes de la tienda; muestra lo devolvible", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }]);
    await doReturn(f, sale, [{ sku: PBA_XL }], VALE);
    const hits = await searchSalesForReturn({ actor: f.actors.vendRga, locationId: store(), query: sale.number.slice(-4) });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: sale.saleId, returnableUnits: 1 });
    const recent = await searchSalesForReturn({ actor: f.actors.vendRga, locationId: store() });
    expect(recent.map((h) => h.id)).toContain(sale.saleId);
    const detail = await getSaleForReturn({ actor: f.actors.vendRga, locationId: store(), saleId: sale.saleId });
    expect(detail.lines[0]).toMatchObject({ soldQty: 2, returnedQty: 1, returnableQty: 1 });
    expect(detail).toMatchObject({ outOfWindow: false, windowDays: 30, paidWithVoucher: false, suggestedRefundMethod: "ANULACION_TRANSBANK" });
  });

  it("la vendedora encuentra un pedido online (de otra ubicación) por su N° para recibirlo en la tienda", async () => {
    const sale = await dispatchedOnlineSale();
    const hits = await searchSalesForReturn({ actor: f.actors.vendRga, locationId: store(), query: sale.number });
    expect(hits.map((h) => h.id)).toEqual([sale.saleId]);
  });
});

describe("reembolso por otro medio que el original (S-06: se sugiere el original)", () => {
  const quoteMoney = async (sale: SoldSale, resolution: Parameters<typeof quoteReturn>[0]["resolution"]) =>
    quoteReturn({ actor: f.actors.belen, locationId: store(), saleId: sale.saleId, lines: toLines(sale, [{ sku: PBA_XL }]), resolution });

  it("venta con tarjeta y reembolso en efectivo: advierte y sugiere la anulación en la máquina", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]); // débito
    const q = await quoteMoney(sale, { kind: "DINERO", method: "EFECTIVO" });
    expect(q.suggestedRefundMethod).toBe("ANULACION_TRANSBANK");
    expect(q.refundDiffersFromOriginal).toBe(true);
    expect(q.warnings.join(" ")).toMatch(/se pagó con tarjeta: lo sugerido es devolver por anulación en la máquina, no en efectivo/);
  });

  it("venta con transferencia y reembolso en efectivo: sugiere la transferencia", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }], { method: "TRANSFERENCIA" });
    const q = await quoteMoney(sale, { kind: "DINERO", method: "EFECTIVO" });
    expect(q.suggestedRefundMethod).toBe("TRANSFERENCIA");
    expect(q.warnings.join(" ")).toMatch(/se pagó con transferencia: lo sugerido es devolver por transferencia/);
  });

  it("el medio original no genera aviso; el vale y el cambio tampoco", async () => {
    await openCaja(f);
    const cash = await sellPos(f, [{ sku: PBA_XL }], { method: "EFECTIVO" });
    expect((await quoteMoney(cash, { kind: "DINERO", method: "EFECTIVO" })).warnings).toEqual([]);
    const card = await sellPos(f, [{ sku: PBA_XL }]);
    const sameMethod = await quoteMoney(card, { kind: "DINERO", method: "ANULACION_TRANSBANK", reference: "ANU-1" });
    expect(sameMethod.refundDiffersFromOriginal).toBe(false);
    expect(sameMethod.warnings).toEqual([]);
    const vale = await quoteMoney(card, VALE);
    expect(vale.refundDiffersFromOriginal).toBe(false);
    expect(vale.warnings).toEqual([]);
  });

  it("es solo un aviso: Belén puede devolver en efectivo una venta con tarjeta", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    const { result } = await doReturn(f, sale, [{ sku: PBA_XL }], { kind: "DINERO", method: "EFECTIVO" }, { actor: f.actors.belen });
    expect(result.refundMethod).toBe("EFECTIVO");
  });
});
