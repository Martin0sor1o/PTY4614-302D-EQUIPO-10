import { beforeEach, describe, expect, it } from "vitest";
import {
  adjustStock,
  consumeReservations,
  createTransferCommand,
  receiveStock,
  receiveTransferCommand,
  releaseReservations,
  reserve,
  sell,
  sendTransferCommand,
} from "@/modules/inventory";
import { expectAppError, expectInvariants, newKey, resetDemo, stockOf, tx, type Fixtures } from "./helpers";

// Acceso cruzado (CLAUDE.md regla 10): cada operación nueva rechaza a quien no corresponde por rol o ubicación,
// y el rechazo no deja cambios de stock.

let f: Fixtures;
let v: string;
beforeEach(async () => {
  f = await resetDemo();
  v = await f.variant("PBA041-NEG-XL"); // Rancagua 5, Providencia 5, Bodega 20
});

async function snapshot() {
  return Promise.all([stockOf(v, f.loc.TIENDA_RANCAGUA), stockOf(v, f.loc.TIENDA_PROVIDENCIA), stockOf(v, f.loc.BODEGA)]);
}

describe("acceso cruzado en InventoryService", () => {
  it("vendedora de Providencia NO puede vender en Rancagua", async () => {
    const before = await snapshot();
    await expectAppError(
      tx((t) => sell(t, { actor: f.actors.vendPro, locationId: f.loc.TIENDA_RANCAGUA, lines: [{ variantId: v, qty: 1 }], saleId: "s", idempotencyKey: newKey() })),
      "FORBIDDEN",
      /propia ubicación/,
    );
    expect(await snapshot()).toEqual(before);
  });

  it("bodega NO puede vender (rol)", async () => {
    await expectAppError(
      tx((t) => sell(t, { actor: f.actors.bodega, locationId: f.loc.BODEGA, lines: [{ variantId: v, qty: 1 }], saleId: "s", idempotencyKey: newKey() })),
      "FORBIDDEN",
    );
  });

  it("vendedora de Providencia NO puede recibir mercadería en Rancagua; bodega NO puede recibir en una tienda", async () => {
    const before = await snapshot();
    await expectAppError(
      receiveStock({ actor: f.actors.vendPro, locationId: f.loc.TIENDA_RANCAGUA, lines: [{ variantId: v, qty: 1 }], idempotencyKey: newKey() }),
      "FORBIDDEN",
    );
    await expectAppError(
      receiveStock({ actor: f.actors.bodega, locationId: f.loc.TIENDA_PROVIDENCIA, lines: [{ variantId: v, qty: 1 }], idempotencyKey: newKey() }),
      "FORBIDDEN",
    );
    expect(await snapshot()).toEqual(before);
  });

  it("solo ADMIN ajusta stock (ni siquiera la vendedora en su tienda)", async () => {
    await expectAppError(
      adjustStock({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, variantId: v, delta: -1, reason: "Merma", idempotencyKey: newKey() }),
      "FORBIDDEN",
      /rol/,
    );
  });

  it("solo ADMIN reserva y libera", async () => {
    await expectAppError(
      tx((t) => reserve(t, { actor: f.actors.vendRga, lines: [{ variantId: v, locationId: f.loc.TIENDA_RANCAGUA, qty: 1 }] })),
      "FORBIDDEN",
    );
    const [r] = await tx((t) => reserve(t, { actor: f.actors.belen, lines: [{ variantId: v, locationId: f.loc.BODEGA, qty: 1 }] }));
    await expectAppError(
      tx((t) => releaseReservations(t, { actor: f.actors.bodega, reservationIds: [r.id], reason: "Cancelado" })),
      "FORBIDDEN",
    );
    await expectInvariants();
  });

  it("consumir reserva de bodega: vendedora NO (rol); bodega sí", async () => {
    const [r] = await tx((t) => reserve(t, { actor: f.actors.belen, lines: [{ variantId: v, locationId: f.loc.BODEGA, qty: 1 }] }));
    await expectAppError(
      tx((t) => consumeReservations(t, { actor: f.actors.vendRga, reservationIds: [r.id], idempotencyKey: newKey() })),
      "FORBIDDEN",
    );
    await tx((t) => consumeReservations(t, { actor: f.actors.bodega, reservationIds: [r.id], idempotencyKey: newKey() }));
    await expectInvariants();
  });

  it("traspasos: crear/enviar solo desde el ORIGEN; recibir solo en el DESTINO", async () => {
    await expectAppError(
      createTransferCommand({
        actor: f.actors.vendPro,
        fromLocationId: f.loc.TIENDA_RANCAGUA,
        toLocationId: f.loc.BODEGA,
        lines: [{ variantId: v, qty: 1 }],
        idempotencyKey: newKey(),
      }),
      "FORBIDDEN",
    );

    const { result: t } = await createTransferCommand({
      actor: f.actors.vendRga,
      fromLocationId: f.loc.TIENDA_RANCAGUA,
      toLocationId: f.loc.BODEGA,
      lines: [{ variantId: v, qty: 1 }],
      idempotencyKey: newKey(),
    });
    await expectAppError(sendTransferCommand({ actor: f.actors.vendPro, transferId: t.id, idempotencyKey: newKey() }), "FORBIDDEN");
    await expectAppError(sendTransferCommand({ actor: f.actors.bodega, transferId: t.id, idempotencyKey: newKey() }), "FORBIDDEN");
    await sendTransferCommand({ actor: f.actors.vendRga, transferId: t.id, idempotencyKey: newKey() });

    await expectAppError(
      receiveTransferCommand({ actor: f.actors.vendRga, transferId: t.id, lines: [{ variantId: v, qty: 1 }], idempotencyKey: newKey() }),
      "FORBIDDEN",
    );
    await expectAppError(
      receiveTransferCommand({ actor: f.actors.vendPro, transferId: t.id, lines: [{ variantId: v, qty: 1 }], idempotencyKey: newKey() }),
      "FORBIDDEN",
    );
    await receiveTransferCommand({ actor: f.actors.bodega, transferId: t.id, lines: [{ variantId: v, qty: 1 }], idempotencyKey: newKey() });
    expect(await stockOf(v, f.loc.BODEGA)).toMatchObject({ onHand: 21 });
    await expectInvariants();
  });

  it("ADMIN opera en cualquier ubicación", async () => {
    await tx((t) => sell(t, { actor: f.actors.belen, locationId: f.loc.TIENDA_PROVIDENCIA, lines: [{ variantId: v, qty: 1 }], saleId: "s", idempotencyKey: newKey() }));
    await receiveStock({ actor: f.actors.belen, locationId: f.loc.TIENDA_RANCAGUA, lines: [{ variantId: v, qty: 1 }], idempotencyKey: newKey() });
    expect(await snapshot()).toEqual([
      { onHand: 6, reserved: 0 },
      { onHand: 4, reserved: 0 },
      { onHand: 20, reserved: 0 },
    ]);
  });
});
