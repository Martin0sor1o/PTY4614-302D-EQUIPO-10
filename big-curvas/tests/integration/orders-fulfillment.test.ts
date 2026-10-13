import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { dispatchOrder, getCouriers, getOrderDetail, markDelivered, prepareOrder } from "@/modules/orders";
import { expectAppError, expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";
import { confirmTestPayment, orderMovements, prepareTestOrder, registerTestOrder } from "./orders-helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const PBA_XL = "PBA041-NEG-XL"; // Rancagua 5 · Bodega 20
const JMT_48 = "JMT012-NEG-48"; // Bodega 6

async function paidOrder(lines = [{ sku: PBA_XL, qty: 2 }]) {
  const order = await registerTestOrder(f, lines);
  const { result } = await confirmTestPayment(f, order.id);
  return result;
}

describe("preparar (picking)", () => {
  it("consume las reservas y baja el stock con VENTA_ONLINE", async () => {
    const variantId = await f.variant(PBA_XL);
    const order = await paidOrder();
    const saleMovements = await db.inventoryMovement.count();

    const { result } = await prepareTestOrder(f, order);

    expect(result.status).toBe("PREPARADO");
    expect(result.preparedAt).not.toBeNull();
    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual({ onHand: 18, reserved: 0 });
    expect(await stockOf(variantId, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 5, reserved: 0 });
    const movements = await orderMovements(order.id);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: "VENTA_ONLINE", quantity: -2, locationId: f.loc.BODEGA, userId: f.actors.belen.id, onHandAfter: 18 });
    expect(await db.inventoryMovement.count()).toBe(saleMovements + 1);
    expect((await db.reservation.findMany()).map((r) => r.status)).toEqual(["CONSUMIDA"]);
    expect(result.lines[0].pickedQty).toBe(2);
    expect(result.events.map((e) => e.status)).toEqual(["PENDIENTE_PAGO", "LISTO_PARA_PREPARAR", "PREPARADO"]);
    await expectInvariants();
  });

  it("rechaza una prenda que no es del pedido, sin cambiar nada", async () => {
    const order = await paidOrder();
    const foreign = await f.variant(JMT_48);
    const pba = await f.variant(PBA_XL);

    await expectAppError(
      prepareOrder({
        actor: f.actors.belen,
        orderId: order.id,
        scanned: [
          { variantId: pba, qty: 2 },
          { variantId: foreign, qty: 1 },
        ],
        idempotencyKey: newKey("picking"),
      }),
      "VALIDATION",
      /no es del pedido PED-000001/,
    );

    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).status).toBe("LISTO_PARA_PREPARAR");
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 2 });
    expect(await orderMovements(order.id)).toHaveLength(0);
    await expectInvariants();
  });

  it("rechaza cantidades de más o de menos", async () => {
    const order = await paidOrder();
    const pba = await f.variant(PBA_XL);
    const scan = (qty: number) =>
      prepareOrder({ actor: f.actors.belen, orderId: order.id, scanned: [{ variantId: pba, qty }], idempotencyKey: newKey("picking") });

    await expectAppError(scan(3), "VALIDATION", /escaneaste 3 y el pedido tiene 2/);
    await expectAppError(scan(1), "VALIDATION", /faltan 1 por escanear/);
    await expectAppError(scan(0), "VALIDATION", /faltan 2/);
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 2 });
    expect(await db.reservation.count({ where: { status: "ACTIVA" } })).toBe(1);
  });

  it("es idempotente: repetir la clave no consume dos veces", async () => {
    const pba = await f.variant(PBA_XL);
    const order = await paidOrder();
    const key = newKey("picking");

    const first = await prepareTestOrder(f, order, key);
    const second = await prepareTestOrder(f, order, key);

    expect(second.replayed).toBe(true);
    expect(first.result.status).toBe("PREPARADO");
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 18, reserved: 0 });
    expect(await orderMovements(order.id)).toHaveLength(1);
  });

  it("doble clic simultáneo (misma clave): se consume una sola vez", async () => {
    const pba = await f.variant(PBA_XL);
    const order = await paidOrder();
    const key = newKey("picking");

    const results = await Promise.allSettled([prepareTestOrder(f, order, key), prepareTestOrder(f, order, key)]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await stockOf(pba, f.loc.BODEGA)).toEqual({ onHand: 18, reserved: 0 });
    expect(await orderMovements(order.id)).toHaveLength(1);
    await expectInvariants();
  });

  it("solo se prepara un pedido LISTO_PARA_PREPARAR", async () => {
    const pending = await registerTestOrder(f, [{ sku: PBA_XL }]);
    await expectAppError(prepareTestOrder(f, pending), "CONFLICT", /pendiente de pago.*no se puede preparar/);
    const order = await paidOrder();
    await prepareTestOrder(f, order);
    await expectAppError(prepareTestOrder(f, order), "CONFLICT", /preparado.*no se puede preparar/);
    expect(await orderMovements(order.id)).toHaveLength(1);
  });
});

describe("despachar y entregar", () => {
  async function preparedOrder() {
    const order = await paidOrder();
    await prepareTestOrder(f, order);
    return order;
  }
  const dispatch = (orderId: string, courier = "Starken", trackingNumber = "STK-998877", key = newKey("despacho")) =>
    dispatchOrder({ actor: f.actors.belen, orderId, courier, trackingNumber, idempotencyKey: key });

  it("la lista de couriers sale de settings", async () => {
    expect(await getCouriers()).toEqual(["Starken", "Blue Express", "Chilexpress"]);
  });

  it("despacha por courier con N° de seguimiento y luego se marca ENTREGADO", async () => {
    const order = await preparedOrder();

    const { result } = await dispatch(order.id, "Blue Express", "BX-12345");
    expect(result.status).toBe("DESPACHADO");
    expect(result).toMatchObject({ courier: "Blue Express", trackingNumber: "BX-12345" });
    expect(result.shippedAt).not.toBeNull();

    const delivered = await markDelivered({ actor: f.actors.belen, orderId: order.id, idempotencyKey: newKey("entrega") });
    expect(delivered.result.status).toBe("ENTREGADO");
    expect(delivered.result.deliveredAt).not.toBeNull();
    expect(delivered.result.events.map((e) => e.status)).toEqual([
      "PENDIENTE_PAGO",
      "LISTO_PARA_PREPARAR",
      "PREPARADO",
      "DESPACHADO",
      "ENTREGADO",
    ]);
    await expectInvariants();
  });

  it("rechaza un courier fuera de la lista y un seguimiento vacío", async () => {
    const order = await preparedOrder();
    await expectAppError(dispatch(order.id, "Correos Fantasma"), "VALIDATION", /no está en la lista/);
    await expectAppError(dispatch(order.id, "Starken", "  "), "VALIDATION", /seguimiento/);
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).status).toBe("PREPARADO");
  });

  it("no se despacha antes de preparar ni se entrega antes de despachar", async () => {
    const order = await paidOrder();
    await expectAppError(dispatch(order.id), "CONFLICT", /listo para preparar.*no se puede despachar/);
    await prepareTestOrder(f, order);
    await expectAppError(markDelivered({ actor: f.actors.belen, orderId: order.id, idempotencyKey: newKey("entrega") }), "CONFLICT");
  });

  it("despachar y entregar son idempotentes", async () => {
    const order = await preparedOrder();
    const key = newKey("despacho");
    const a = await dispatch(order.id, "Starken", "STK-1", key);
    const b = await dispatch(order.id, "Starken", "STK-1", key);
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(true);
    expect(b.result.trackingNumber).toBe("STK-1");

    const dKey = newKey("entrega");
    await markDelivered({ actor: f.actors.belen, orderId: order.id, idempotencyKey: dKey });
    const again = await markDelivered({ actor: f.actors.belen, orderId: order.id, idempotencyKey: dKey });
    expect(again.replayed).toBe(true);
    expect(await db.onlineOrderEvent.count({ where: { orderId: order.id, status: "DESPACHADO" } })).toBe(1);
  });
});
