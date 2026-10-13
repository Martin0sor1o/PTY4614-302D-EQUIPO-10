import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { searchCustomers } from "@/modules/customers";
import {
  cancelOrder,
  confirmPayment,
  dispatchOrder,
  getOrderBoard,
  getOrderDetail,
  markDelivered,
  registerOrder,
  searchOrderVariants,
  updateOrder,
} from "@/modules/orders";
import { expectAppError, newKey, resetDemo, type Fixtures } from "./helpers";
import { confirmTestPayment, prepareTestOrder, registerTestOrder } from "./orders-helpers";

// Acceso cruzado de los pedidos online (regla 10): solo Belén registra, confirma y cancela;
// la vendedora no opera pedidos; BODEGA solo prepara y despacha en su ubicación.

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const PBA_XL = "PBA041-NEG-XL";

describe("acceso a pedidos online", () => {
  it("la vendedora no puede registrar, editar, confirmar, preparar, despachar, entregar ni cancelar", async () => {
    const order = await registerTestOrder(f, [{ sku: PBA_XL }]);
    const paid = (await confirmTestPayment(f, order.id)).result;
    const variantId = await f.variant(PBA_XL);
    const vend = f.actors.vendRga;

    await expectAppError(
      registerOrder({
        actor: vend,
        channel: "INSTAGRAM",
        newCustomer: { name: "Clienta" },
        lines: [{ variantId, qty: 1, discountBps: 0 }],
        shippingCost: 0,
        shippingAddress: "Calle 123, Rancagua",
        idempotencyKey: newKey("reg"),
      }),
      "FORBIDDEN",
    );
    await expectAppError(
      updateOrder({
        actor: vend,
        orderId: order.id,
        channel: "INSTAGRAM",
        customerId: order.customer.id,
        lines: [{ variantId, qty: 1, discountBps: 0 }],
        shippingCost: 0,
        shippingAddress: "Calle 123, Rancagua",
      }),
      "FORBIDDEN",
    );
    await expectAppError(
      confirmPayment({ actor: vend, orderId: order.id, payment: { method: "TRANSFERENCIA", reference: "X-1" }, idempotencyKey: newKey("pago") }),
      "FORBIDDEN",
    );
    await expectAppError(prepareTestOrder(f, paid, newKey("pick"), vend), "FORBIDDEN");
    await expectAppError(
      dispatchOrder({ actor: vend, orderId: order.id, courier: "Starken", trackingNumber: "STK-1", idempotencyKey: newKey("d") }),
      "FORBIDDEN",
    );
    await expectAppError(markDelivered({ actor: vend, orderId: order.id, idempotencyKey: newKey("e") }), "FORBIDDEN");
    await expectAppError(cancelOrder({ actor: vend, orderId: order.id, reason: "No corresponde", idempotencyKey: newKey("c") }), "FORBIDDEN");

    // Consultas: tampoco ve pedidos, el tablero, la búsqueda de prendas ni las clientas.
    await expectAppError(getOrderDetail({ actor: vend, orderId: order.id }), "FORBIDDEN");
    await expectAppError(getOrderDetail({ actor: vend, orderId: order.id, forPicking: true }), "FORBIDDEN");
    await expectAppError(getOrderBoard({ actor: vend }), "FORBIDDEN");
    await expectAppError(searchOrderVariants({ actor: vend, query: "PBA" }), "FORBIDDEN");
    await expectAppError(searchCustomers({ actor: vend, query: "clienta" }), "FORBIDDEN");

    // Nada cambió.
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).status).toBe("LISTO_PARA_PREPARAR");
    expect(await db.onlineOrder.count()).toBe(1);
  });

  it("BODEGA prepara y despacha en su ubicación, pero no registra, confirma ni cancela", async () => {
    const order = await registerTestOrder(f, [{ sku: PBA_XL }]);
    const paid = (await confirmTestPayment(f, order.id)).result;
    const bodega = f.actors.bodega;

    await expectAppError(
      confirmPayment({ actor: bodega, orderId: order.id, payment: { method: "TRANSFERENCIA", reference: "X-1" }, idempotencyKey: newKey("pago") }),
      "FORBIDDEN",
    );
    await expectAppError(cancelOrder({ actor: bodega, orderId: order.id, reason: "No corresponde", idempotencyKey: newKey("c") }), "FORBIDDEN");
    await expectAppError(getOrderBoard({ actor: bodega }), "FORBIDDEN");

    const prepared = await prepareTestOrder(f, paid, newKey("pick"), bodega);
    expect(prepared.result.status).toBe("PREPARADO");
    const dispatched = await dispatchOrder({
      actor: bodega,
      orderId: order.id,
      courier: "Chilexpress",
      trackingNumber: "CHX-1",
      idempotencyKey: newKey("d"),
    });
    expect(dispatched.result.status).toBe("DESPACHADO");
    expect((await getOrderDetail({ actor: bodega, orderId: order.id, forPicking: true })).status).toBe("DESPACHADO");
  });

  it("un usuario BODEGA de otra ubicación no prepara pedidos de la bodega", async () => {
    // BODEGA asignado a la tienda (rol correcto, ubicación equivocada).
    const store = f.actors.vendRga;
    const wrongLocation = { ...f.actors.bodega, location: store.location };
    const order = await registerTestOrder(f, [{ sku: PBA_XL }]);
    const paid = (await confirmTestPayment(f, order.id)).result;

    await expectAppError(prepareTestOrder(f, paid, newKey("pick"), wrongLocation), "FORBIDDEN", /propia ubicación/);
    await expectAppError(getOrderDetail({ actor: wrongLocation, orderId: order.id, forPicking: true }), "FORBIDDEN");
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).status).toBe("LISTO_PARA_PREPARAR");
  });
});
