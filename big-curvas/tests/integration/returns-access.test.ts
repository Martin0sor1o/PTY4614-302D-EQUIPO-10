import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/access";
import { getReturn, getSaleForReturn, quoteReturn, requestReturnApproval, searchSalesForReturn } from "@/modules/returns";
import { dispatchOrder } from "@/modules/orders";
import { expectAppError, createExtraStore, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";
import { confirmTestPayment, prepareTestOrder, registerTestOrder } from "./orders-helpers";
import { DINERO_TRANSFERENCIA, doReturn, lineIds, openCaja, PBA_XL, sellPos, toLines, VALE, type SoldSale } from "./returns-helpers";

// Acceso cruzado (regla 10): cada acción de devoluciones exige rol Y ubicación. La vendedora y la bodega solo escriben en su
// `location_id`; el ADMIN opera en cualquiera. (Las Server Actions con sesiones reales llegan con la UI del POS.)

let f: Fixtures;
let extra: { id: string; code: string };
let extraSeller: Actor;
beforeEach(async () => {
  f = await resetDemo();
  extra = await createExtraStore();
  const u = await db.user.create({ data: { name: "Vendedora Extra", email: "extra@bigcurvas.test", role: "VENDEDORA", locationId: extra.id } });
  extraSeller = { id: u.id, role: "VENDEDORA", location: { id: extra.id, code: extra.code, name: "Tienda Extra", type: "STORE" } };
});

const store = () => f.loc.TIENDA_RANCAGUA;

async function onlineDispatchedSale(): Promise<SoldSale> {
  const order = await registerTestOrder(f, [{ sku: PBA_XL }]);
  await confirmTestPayment(f, order.id);
  await prepareTestOrder(f, order);
  await dispatchOrder({ actor: f.actors.belen, orderId: order.id, courier: "Starken", trackingNumber: "STK-1", idempotencyKey: newKey("d") });
  const s = await db.sale.findUniqueOrThrow({ where: { onlineOrderId: order.id } });
  return { saleId: s.id, number: s.number, total: s.total, line: await lineIds(f, s.id, [PBA_XL]) };
}

describe("rechazos por ubicación", () => {
  it("la vendedora de Rancagua no procesa devoluciones en la BODEGA ni en otra tienda (no cambia stock ni crea nada)", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    const bodegaBefore = await stockOf(await f.variant(PBA_XL), f.loc.BODEGA);
    for (const locationId of [f.loc.BODEGA, extra.id]) {
      await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], VALE, { locationId }), "FORBIDDEN");
      await expectAppError(
        quoteReturn({ actor: f.actors.vendRga, locationId, saleId: sale.saleId, lines: toLines(sale, [{ sku: PBA_XL }]), resolution: VALE }),
        "FORBIDDEN",
      );
      await expectAppError(searchSalesForReturn({ actor: f.actors.vendRga, locationId, query: "RGA" }), "FORBIDDEN");
      await expectAppError(getSaleForReturn({ actor: f.actors.vendRga, locationId, saleId: sale.saleId }), "FORBIDDEN");
      await expectAppError(
        requestReturnApproval({ actor: f.actors.vendRga, locationId, saleId: sale.saleId, lines: toLines(sale, [{ sku: PBA_XL }]), resolution: DINERO_TRANSFERENCIA, reason: "FALLA", idempotencyKey: newKey("s") }),
        "FORBIDDEN",
      );
    }
    expect(await db.return.count()).toBe(0);
    expect(await stockOf(await f.variant(PBA_XL), f.loc.BODEGA)).toEqual(bodegaBefore);
  });

  it("la vendedora de la tienda extra no procesa en Rancagua", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], VALE, { actor: extraSeller, locationId: store() }), "FORBIDDEN");
    await expectAppError(searchSalesForReturn({ actor: extraSeller, locationId: store() }), "FORBIDDEN");
    expect(await db.return.count()).toBe(0);
  });

  it("el rol BODEGA no tiene devoluciones (S-10: en la bodega las registra Belén)", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    await expectAppError(doReturn(f, sale, [{ sku: PBA_XL }], VALE, { actor: f.actors.bodega, locationId: f.loc.BODEGA }), "FORBIDDEN");
    await expectAppError(quoteReturn({ actor: f.actors.bodega, locationId: f.loc.BODEGA, saleId: sale.saleId, lines: toLines(sale, [{ sku: PBA_XL }]), resolution: VALE }), "FORBIDDEN");
    await expectAppError(searchSalesForReturn({ actor: f.actors.bodega, locationId: f.loc.BODEGA }), "FORBIDDEN");
  });

  it("solo una VENDEDORA pide aprobaciones; la de otra tienda no las pide en Rancagua", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    const req = (actor: Actor, locationId: string) =>
      requestReturnApproval({ actor, locationId, saleId: sale.saleId, lines: toLines(sale, [{ sku: PBA_XL }]), resolution: DINERO_TRANSFERENCIA, reason: "FALLA", idempotencyKey: newKey("s") });
    await expectAppError(req(f.actors.belen, store()), "FORBIDDEN");
    await expectAppError(req(f.actors.bodega, f.loc.BODEGA), "FORBIDDEN");
    await expectAppError(req(extraSeller, store()), "FORBIDDEN");
  });
});

describe("lo que sí se puede", () => {
  it("Belén (ADMIN) procesa en la tienda y en la bodega", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }]);
    const a = await doReturn(f, sale, [{ sku: PBA_XL }], VALE, { actor: f.actors.belen, locationId: store() });
    const b = await doReturn(f, sale, [{ sku: PBA_XL }], VALE, { actor: f.actors.belen, locationId: f.loc.BODEGA });
    expect(a.result.location.id).toBe(store());
    expect(b.result.location.id).toBe(f.loc.BODEGA);
  });

  it("la venta original puede ser de otra ubicación: la vendedora recibe en SU tienda un pedido online", async () => {
    await openCaja(f);
    const sale = await onlineDispatchedSale();
    const detail = await getSaleForReturn({ actor: f.actors.vendRga, locationId: store(), saleId: sale.saleId });
    expect(detail.locationName).toMatch(/Bodega/i);
    const { result } = await doReturn(f, sale, [{ sku: PBA_XL }], VALE);
    expect(result.location.id).toBe(store()); // la prenda entra a la ubicación que la recibe
  });
});

describe("leer una devolución", () => {
  it("la vendedora lee las de su ubicación; no las de la bodega; Belén lee todas", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }]);
    const mine = (await doReturn(f, sale, [{ sku: PBA_XL }], VALE)).result;
    const bodega = (await doReturn(f, sale, [{ sku: PBA_XL }], VALE, { actor: f.actors.belen, locationId: f.loc.BODEGA })).result;
    expect((await getReturn(f.actors.vendRga, mine.id)).id).toBe(mine.id);
    await expectAppError(getReturn(f.actors.vendRga, bodega.id), "FORBIDDEN");
    await expectAppError(getReturn(extraSeller, mine.id), "FORBIDDEN");
    await expectAppError(getReturn(f.actors.bodega, bodega.id), "FORBIDDEN");
    expect((await getReturn(f.actors.belen, bodega.id)).id).toBe(bodega.id);
    await expectAppError(getReturn(f.actors.belen, "no-existe"), "NOT_FOUND");
  });
});
