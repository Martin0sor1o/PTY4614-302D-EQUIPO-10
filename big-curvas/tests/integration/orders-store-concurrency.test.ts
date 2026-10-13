import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { adjustStock } from "@/modules/inventory";
import { getOrderDetail } from "@/modules/orders";
import { createSale, openCashSession } from "@/modules/sales";
import { expectInvariants, newKey, resetDemo, stockOf } from "./helpers";
import { allInStore, confirmTestPayment, registerTestOrder } from "./orders-helpers";

const AZU_48 = "JMT012-AZU-48"; // Rancagua: 1 · Bodega: 8 (el test deja la bodega en 0)

describe("última unidad de la tienda: confirmar un pedido vs vender en el POS", () => {
  it("al mismo tiempo gana uno solo (repetido varias veces)", async () => {
    const outcomes = { pedido: 0, pos: 0 };

    for (let round = 0; round < 4; round++) {
      const f = await resetDemo();
      const variantId = await f.variant(AZU_48);
      // La bodega queda sin stock para que el pedido tenga que apartarse en la tienda.
      await adjustStock({ actor: f.actors.belen, locationId: f.loc.BODEGA, variantId, delta: -8, reason: "Prueba: bodega vacía", idempotencyKey: newKey("aj") });
      const order = await registerTestOrder(f, [{ sku: AZU_48, qty: 1 }]);
      await openCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, openingCash: 10_000 });

      const [confirm, sale] = await Promise.allSettled([
        confirmTestPayment(f, order.id, undefined, undefined, allInStore(f, order)),
        createSale({
          actor: f.actors.vendRga,
          locationId: f.loc.TIENDA_RANCAGUA,
          lines: [{ variantId, qty: 1, discountBps: 0 }],
          payment: { method: "DEBITO", reference: `V-${round}` },
          idempotencyKey: newKey("venta"),
        }),
      ]);

      const orderWon = confirm.status === "fulfilled";
      const posWon = sale.status === "fulfilled";
      expect(orderWon !== posWon, `ronda ${round}: debe ganar exactamente uno`).toBe(true);

      const store = await stockOf(variantId, f.loc.TIENDA_RANCAGUA);
      const current = await getOrderDetail({ actor: f.actors.belen, orderId: order.id });
      if (orderWon) {
        outcomes.pedido++;
        expect(sale).toMatchObject({ status: "rejected", reason: { code: "STOCK_INSUFICIENTE" } });
        expect(store).toEqual({ onHand: 1, reserved: 1 }); // la unidad quedó apartada para el pedido
        expect(current.status).toBe("ESPERANDO_TRASPASO");
        expect(await db.transfer.count({ where: { onlineOrderId: order.id } })).toBe(1);
        expect(await db.sale.count({ where: { channel: "POS" } })).toBe(0);
      } else {
        outcomes.pos++;
        expect(confirm).toMatchObject({ status: "rejected", reason: { code: "STOCK_INSUFICIENTE" } });
        expect(store).toEqual({ onHand: 0, reserved: 0 }); // la vendió el POS
        expect(current.status).toBe("PENDIENTE_PAGO"); // el pedido sigue pendiente, sin venta ni traslado
        expect(await db.transfer.count()).toBe(0);
        expect(await db.sale.count({ where: { channel: "INSTAGRAM" } })).toBe(0);
        expect(await db.reservation.count()).toBe(0);
      }
      await expectInvariants();
    }
    // Informativo: ambos resultados son válidos; lo que importa es que nunca ganen los dos.
    expect(outcomes.pedido + outcomes.pos).toBe(4);
  });
});
