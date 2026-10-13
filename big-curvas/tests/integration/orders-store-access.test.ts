import { beforeEach, describe, expect, it } from "vitest";
import {
  cancelTransferCommand,
  receiveTransferCommand,
  sendTransferCommand,
  updateTransferDraftCommand,
} from "@/modules/inventory";
import { confirmPayment, fillShortage, getOrderDetail, receiveTransferAndSync, resolveTransferAndSync } from "@/modules/orders";
import { expectAppError, expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";
import { allInStore, confirmTestPayment, orderTransfers, registerTestOrder } from "./orders-helpers";

// Acceso cruzado del Hito 2 (regla 10): la vendedora de Rancagua SÍ envía el traslado del pedido desde su tienda,
// pero no lo edita ni lo anula, no lo recibe en bodega, no resuelve diferencias ni completa faltantes.

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const CPU_2XL = "CPU053-NEG-2XL";

async function pendingTransferOrder(qty = 2) {
  const order = await registerTestOrder(f, [{ sku: CPU_2XL, qty }]);
  await confirmTestPayment(f, order.id, undefined, undefined, allInStore(f, order));
  const [transfer] = await orderTransfers(order.id);
  return { order, transfer, variantId: await f.variant(CPU_2XL) };
}

describe("acceso al traslado de un pedido online", () => {
  it("la vendedora de Rancagua envía el traslado del pedido desde su tienda", async () => {
    const { order, transfer, variantId } = await pendingTransferOrder();

    const { result } = await sendTransferCommand({ actor: f.actors.vendRga, transferId: transfer.id, idempotencyKey: newKey("enviar") });

    expect(result.transfer.status).toBe("EN_TRANSITO");
    expect(await stockOf(variantId, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 0 });
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).status).toBe("ESPERANDO_TRASPASO");
    await expectInvariants();
  });

  it("la vendedora no edita ni anula el traslado del pedido, ni lo recibe en bodega", async () => {
    const { order, transfer, variantId } = await pendingTransferOrder();
    const vend = f.actors.vendRga;

    await expectAppError(updateTransferDraftCommand({ actor: vend, transferId: transfer.id, lines: [{ variantId, qty: 1 }] }), "VALIDATION", /ligado a un pedido/);
    await expectAppError(cancelTransferCommand({ actor: vend, transferId: transfer.id }), "VALIDATION", /ligado a un pedido/);

    await sendTransferCommand({ actor: vend, transferId: transfer.id, idempotencyKey: newKey("enviar") });
    // Recibir es en la bodega: la vendedora de Rancagua no opera allí (ni por la envoltura del pedido ni por el comando directo).
    await expectAppError(
      receiveTransferAndSync({ actor: vend, transferId: transfer.id, lines: [{ variantId, qty: 2 }], idempotencyKey: newKey("recibir") }),
      "FORBIDDEN",
      /propia ubicación/,
    );
    await expectAppError(
      receiveTransferCommand({ actor: vend, transferId: transfer.id, lines: [{ variantId, qty: 2 }], idempotencyKey: newKey("recibir") }),
      "FORBIDDEN",
    );
    expect((await orderTransfers(order.id))[0].status).toBe("EN_TRANSITO");
    expect(await stockOf(variantId, f.loc.BODEGA)).toEqual({ onHand: 0, reserved: 0 });
  });

  it("un usuario de BODEGA no envía el traslado que sale de la tienda, pero sí lo recibe en bodega", async () => {
    const { order, transfer, variantId } = await pendingTransferOrder();
    await expectAppError(
      sendTransferCommand({ actor: f.actors.bodega, transferId: transfer.id, idempotencyKey: newKey("enviar") }),
      "FORBIDDEN",
      /propia ubicación/,
    );

    await sendTransferCommand({ actor: f.actors.vendRga, transferId: transfer.id, idempotencyKey: newKey("enviar") });
    await receiveTransferAndSync({ actor: f.actors.bodega, transferId: transfer.id, lines: [{ variantId, qty: 2 }], idempotencyKey: newKey("recibir") });
    expect((await getOrderDetail({ actor: f.actors.belen, orderId: order.id })).status).toBe("LISTO_PARA_PREPARAR");
  });

  it("solo Belén resuelve diferencias, completa faltantes y aparta en la tienda al confirmar", async () => {
    const { order, transfer, variantId } = await pendingTransferOrder(3);
    await sendTransferCommand({ actor: f.actors.vendRga, transferId: transfer.id, idempotencyKey: newKey("enviar") });
    await receiveTransferAndSync({ actor: f.actors.belen, transferId: transfer.id, lines: [{ variantId, qty: 2 }], idempotencyKey: newKey("recibir") });
    const [t] = await orderTransfers(order.id);
    const lineId = t.lines[0].id;

    for (const actor of [f.actors.vendRga, f.actors.bodega]) {
      await expectAppError(
        resolveTransferAndSync({ actor, transferId: transfer.id, resolutions: [{ lineId, resolution: "MERMA" }], idempotencyKey: newKey("resolver") }),
        "FORBIDDEN",
      );
      await expectAppError(fillShortage({ actor, orderId: order.id, idempotencyKey: newKey("fill") }), "FORBIDDEN");
    }
    expect((await orderTransfers(order.id))[0].status).toBe("RECIBIDO_CON_DIFERENCIAS");

    // La vendedora tampoco confirma un pago apartando en su tienda.
    const other = await registerTestOrder(f, [{ sku: CPU_2XL, qty: 1 }]);
    await expectAppError(
      confirmPayment({
        actor: f.actors.vendRga,
        orderId: other.id,
        payment: { method: "TRANSFERENCIA", reference: "X-1" },
        lineSources: allInStore(f, other),
        idempotencyKey: newKey("pago"),
      }),
      "FORBIDDEN",
    );
    await expectInvariants();
  });
});
