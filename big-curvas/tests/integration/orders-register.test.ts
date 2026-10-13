import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { formatCLP } from "@/lib/money";
import { getOrderDetail, registerOrder, updateOrder } from "@/modules/orders";
import { priceOrder } from "@/modules/sales";
import { expectAppError, expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";
import { confirmTestPayment, registerTestOrder } from "./orders-helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const PBA_XL = "PBA041-NEG-XL"; // Rancagua 5 · Bodega 20
const CPU_2XL = "CPU053-NEG-2XL"; // Rancagua 3 · Bodega 0

describe("registrar pedido", () => {
  it("no reserva ni mueve stock: solo muestra el disponible (RN-07)", async () => {
    const variantId = await f.variant(PBA_XL);
    const before = {
      bodega: await stockOf(variantId, f.loc.BODEGA),
      tienda: await stockOf(variantId, f.loc.TIENDA_RANCAGUA),
      movements: await db.inventoryMovement.count(),
    };

    const order = await registerTestOrder(f, [{ sku: PBA_XL, qty: 2 }], { shippingCost: 3990 });

    expect(order.status).toBe("PENDIENTE_PAGO");
    expect(order.number).toBe("PED-000001");
    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual(before.bodega);
    expect(await stockOf(variantId, f.loc.TIENDA_RANCAGUA)).toEqual(before.tienda);
    expect(await db.inventoryMovement.count()).toBe(before.movements);
    expect(await db.reservation.count()).toBe(0);
    expect(await db.sale.count()).toBe(0);

    // El disponible por ubicación se muestra (bodega primero).
    const line = order.lines[0];
    expect(line.availability.map((a) => [a.name, a.available])).toEqual([
      ["Bodega", 20],
      ["Tienda Rancagua", 5],
    ]);
    expect(line.reserved).toEqual([]);
    expect(order.events.map((e) => e.status)).toEqual(["PENDIENTE_PAGO"]);
    await expectInvariants();
  });

  it("deja registrar una prenda sin disponible (solo se avisa al confirmar el pago)", async () => {
    const order = await registerTestOrder(f, [{ sku: CPU_2XL, qty: 2 }]);
    expect(order.status).toBe("PENDIENTE_PAGO");
    expect(order.lines[0].availability.map((a) => a.available)).toEqual([0, 3]);
  });

  it("calcula en el servidor subtotal, descuento, envío y total con sales/pricing", async () => {
    const p = await db.productVariant.findUniqueOrThrow({
      where: { sku: PBA_XL },
      select: { priceOverride: true, product: { select: { basePrice: true } } },
    });
    const unit = p.priceOverride ?? p.product.basePrice;
    const expected = priceOrder([{ unitPrice: unit, quantity: 2, discountBps: 1000 }], 3990);

    const order = await registerTestOrder(f, [{ sku: PBA_XL, qty: 2, discountBps: 1000 }], { shippingCost: 3990 });

    expect(order.subtotal).toBe(expected.subtotal);
    expect(order.discountTotal).toBe(expected.discountTotal);
    expect(order.shippingCost).toBe(3990);
    expect(order.total).toBe(expected.total);
    expect(order.total).toBe(order.subtotal - order.discountTotal + order.shippingCost);
    expect(order.lines[0].lineTotal).toBe(expected.lines[0].lineTotal);
    expect(formatCLP(order.total)).toMatch(/^\$/);
  });

  it("es idempotente: la misma clave devuelve el mismo pedido", async () => {
    const key = newKey("registrar");
    const a = await registerTestOrder(f, [{ sku: PBA_XL }], { key });
    const b = await registerTestOrder(f, [{ sku: PBA_XL }], { key });
    expect(b.id).toBe(a.id);
    expect(await db.onlineOrder.count()).toBe(1);
    expect(await db.customer.count()).toBe(1);
  });

  it("dobles clics simultáneos con la misma clave crean un solo pedido", async () => {
    const key = newKey("registrar");
    await Promise.allSettled([registerTestOrder(f, [{ sku: PBA_XL }], { key }), registerTestOrder(f, [{ sku: PBA_XL }], { key })]);
    expect(await db.onlineOrder.count()).toBe(1);
  });

  it("rechaza una prenda repetida y un total en cero", async () => {
    const variantId = await f.variant(PBA_XL);
    await expectAppError(
      registerOrder({
        actor: f.actors.belen,
        channel: "INSTAGRAM",
        newCustomer: { name: "Clienta" },
        lines: [
          { variantId, qty: 1, discountBps: 0 },
          { variantId, qty: 1, discountBps: 0 },
        ],
        shippingCost: 0,
        shippingAddress: "Calle 123, Rancagua",
        idempotencyKey: newKey("rep"),
      }),
      "VALIDATION",
      /repetida/,
    );
    await expectAppError(registerTestOrder(f, [{ sku: PBA_XL, discountBps: 10_000 }]), "VALIDATION", /mayor a \$0/);
    expect(await db.onlineOrder.count()).toBe(0);
    expect(await db.customer.count()).toBe(0); // la ficha nueva se revierte con el pedido
  });

  it("el descuento de Belén por sobre el límite de la vendedora queda en audit_log", async () => {
    const order = await registerTestOrder(f, [{ sku: PBA_XL, discountBps: 500 }]);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "DISCOUNT_OVERRIDE", entityId: order.id } });
    expect(audit.entity).toBe("online_order");
    expect(audit.userId).toBe(f.actors.belen.id);
  });

  it("se puede editar mientras está pendiente de pago, y no después de pagar", async () => {
    const order = await registerTestOrder(f, [{ sku: PBA_XL, qty: 1 }]);
    const variantId = await f.variant(PBA_XL);
    const edit = (qty: number) =>
      updateOrder({
        actor: f.actors.belen,
        orderId: order.id,
        channel: "WHATSAPP",
        customerId: order.customer.id,
        lines: [{ variantId, qty, discountBps: 0 }],
        shippingCost: 2500,
        shippingAddress: "Otra dirección 456, Rancagua",
      });

    const edited = await edit(3);
    expect(edited.lines[0].quantity).toBe(3);
    expect(edited.channel).toBe("WHATSAPP");
    expect(edited.shippingCost).toBe(2500);
    expect(edited.total).toBe(edited.subtotal - edited.discountTotal + 2500);
    expect(edited.events.map((e) => e.note)).toContain("Pedido editado");

    await confirmTestPayment(f, order.id);
    await expectAppError(edit(2), "CONFLICT", /no se puede editar/);
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).lines[0].quantity).toBe(3);
  });

  it("el historial de estados es de solo inserción (trigger en la BD)", async () => {
    const order = await registerTestOrder(f, [{ sku: PBA_XL }]);
    await expect(db.onlineOrderEvent.updateMany({ where: { orderId: order.id }, data: { note: "adulterado" } })).rejects.toThrow();
    await expect(db.onlineOrderEvent.deleteMany({ where: { orderId: order.id } })).rejects.toThrow();
  });
});
