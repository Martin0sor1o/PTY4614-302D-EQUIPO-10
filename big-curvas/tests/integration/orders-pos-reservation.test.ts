import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserve } from "@/modules/inventory";
import { createSale, openCashSession, searchPosItems } from "@/modules/sales";
import { createOrderLineFixture, expectAppError, expectInvariants, newKey, resetDemo, stockOf, tx, type Fixtures } from "./helpers";

// RF-POS-03: una unidad de la tienda reservada para un pedido online no se puede vender, y el aviso nombra el pedido.
// (El Hito 2 crea estas reservas desde el pedido; aquí se arman con InventoryService.reserve ligado a un pedido.)

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const AZU_48 = "JMT012-AZU-48"; // Rancagua: 1 · Bodega: 8

describe("POS y unidades reservadas para pedidos", () => {
  it("no vende una unidad reservada y el aviso muestra el N° de pedido", async () => {
    const variantId = await f.variant(AZU_48);
    const { orderId, orderLineId } = await createOrderLineFixture(f, variantId, f.loc.TIENDA_RANCAGUA, 1);
    const order = await db.onlineOrder.findUniqueOrThrow({ where: { id: orderId }, select: { number: true } });
    await tx((t) => reserve(t, { actor: f.actors.belen, lines: [{ variantId, locationId: f.loc.TIENDA_RANCAGUA, qty: 1, orderLineId }] }));
    await openCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, openingCash: 10_000 });

    const [item] = await searchPosItems({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, query: AZU_48 });
    expect(item.here).toEqual({ onHand: 1, reserved: 1, available: 0 });
    expect(item.reservedFor).toEqual([{ orderNumber: order.number, qty: 1 }]);

    await expectAppError(
      createSale({
        actor: f.actors.vendRga,
        locationId: f.loc.TIENDA_RANCAGUA,
        lines: [{ variantId, qty: 1, discountBps: 0 }],
        payment: { method: "DEBITO", reference: "V-1" },
        idempotencyKey: newKey("venta"),
      }),
      "STOCK_INSUFICIENTE",
      /1 reservada/,
    );
    expect(await stockOf(variantId, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 1 });
    expect(await db.sale.count()).toBe(0);
    await expectInvariants();
  });

  it("sin reservas no hay aviso de pedido", async () => {
    const [item] = await searchPosItems({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, query: AZU_48 });
    expect(item.reservedFor).toEqual([]);
  });
});
