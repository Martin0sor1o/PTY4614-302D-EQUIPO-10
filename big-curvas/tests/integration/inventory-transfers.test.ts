import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createTransferCommand,
  getStockMatrix,
  receiveTransferCommand,
  reserve,
  sendTransferCommand,
} from "@/modules/inventory";
import {
  countMovements,
  createOrderLineFixture,
  expectAppError,
  expectInvariants,
  newKey,
  resetDemo,
  stockOf,
  tx,
  type Fixtures,
} from "./helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

async function inTransitOf(variantId: string): Promise<number> {
  const rows = await getStockMatrix();
  return rows.find((r) => r.variantId === variantId)!.inTransit;
}

describe("traspaso Bodega → Rancagua", () => {
  it("con diferencia: baja en origen al enviar, sube en destino SOLO lo escaneado y la diferencia queda registrada", async () => {
    const blusa = await f.variant("BLM022-BUR-3XL"); // Bodega 5, Rancagua 0
    const polera = await f.variant("PBA041-NEG-XL"); // Bodega 20, Rancagua 5

    const { result: created } = await createTransferCommand({
      actor: f.actors.bodega,
      fromLocationId: f.loc.BODEGA,
      toLocationId: f.loc.TIENDA_RANCAGUA,
      reason: "REPOSICION",
      lines: [
        { variantId: blusa, qty: 3 },
        { variantId: polera, qty: 1 },
        { variantId: polera, qty: 1 }, // escaneada dos veces → una línea de 2
      ],
      idempotencyKey: newKey("crear"),
    });
    expect(created.number).toMatch(/^TR-\d{6}$/);
    expect(created.status).toBe("BORRADOR");
    expect(created.lines.find((l) => l.variantId === polera)!.qtySent).toBe(2);
    // BORRADOR no mueve stock
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 5, reserved: 0 });

    const { result: sent } = await sendTransferCommand({ actor: f.actors.bodega, transferId: created.id, idempotencyKey: newKey("enviar") });
    expect(sent.transfer.status).toBe("EN_TRANSITO");
    expect(sent.movements.map((m) => [m.type, m.quantity])).toEqual(
      [blusa, polera].sort().map((v) => ["TRASPASO_SALIDA", v === blusa ? -3 : -2]),
    );
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 0 });
    expect(await stockOf(polera, f.loc.BODEGA)).toEqual({ onHand: 18, reserved: 0 });
    expect(await inTransitOf(blusa)).toBe(3); // en tránsito se calcula
    await expectInvariants();

    // Rancagua escanea solo 2 de las 3 blusas y las 2 poleras
    const { result: received } = await receiveTransferCommand({
      actor: f.actors.vendRga,
      transferId: created.id,
      lines: [
        { variantId: blusa, qty: 1 },
        { variantId: polera, qty: 2 },
        { variantId: blusa, qty: 1 },
      ],
      idempotencyKey: newKey("recibir"),
    });
    expect(received.transfer.status).toBe("RECIBIDO_CON_DIFERENCIAS");
    const line = received.transfer.lines.find((l) => l.variantId === blusa)!;
    expect(line).toMatchObject({ qtySent: 3, qtyReceived: 2 });
    expect(await stockOf(blusa, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 2, reserved: 0 });
    expect(await stockOf(polera, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 7, reserved: 0 });
    // La diferencia NO se ajusta sola: bodega sigue en 2 y no hay AJUSTE/MERMA
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 0 });
    expect(await countMovements({ variantId: blusa, type: "AJUSTE" })).toBe(0);
    expect(await countMovements({ variantId: blusa, type: "MERMA_TRASPASO" })).toBe(0);
    expect(await inTransitOf(blusa)).toBe(0);
    await expectInvariants();
  });

  it("sin diferencia → RECIBIDO", async () => {
    const blusa = await f.variant("BLM022-BUR-3XL");
    const { result: t } = await createTransferCommand({
      actor: f.actors.belen,
      fromLocationId: f.loc.BODEGA,
      toLocationId: f.loc.TIENDA_RANCAGUA,
      lines: [{ variantId: blusa, qty: 2 }],
      idempotencyKey: newKey(),
    });
    await sendTransferCommand({ actor: f.actors.bodega, transferId: t.id, idempotencyKey: newKey() });
    const { result } = await receiveTransferCommand({
      actor: f.actors.vendRga,
      transferId: t.id,
      lines: [{ variantId: blusa, qty: 2 }],
      idempotencyKey: newKey(),
    });
    expect(result.transfer.status).toBe("RECIBIDO");
    expect(await stockOf(blusa, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 2, reserved: 0 });
    await expectInvariants();
  });

  it("enviar sin stock suficiente → STOCK_INSUFICIENTE y el traspaso sigue en BORRADOR", async () => {
    const blusa = await f.variant("BLM022-BUR-3XL"); // Bodega 5
    const { result: t } = await createTransferCommand({
      actor: f.actors.bodega,
      fromLocationId: f.loc.BODEGA,
      toLocationId: f.loc.TIENDA_RANCAGUA,
      lines: [{ variantId: blusa, qty: 6 }],
      idempotencyKey: newKey(),
    });
    await expectAppError(sendTransferCommand({ actor: f.actors.bodega, transferId: t.id, idempotencyKey: newKey() }), "STOCK_INSUFICIENTE");
    expect((await db.transfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("BORRADOR");
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 5, reserved: 0 });
  });

  it("enviar o recibir dos veces (con otra clave) → CONFLICT; escanear una prenda ajena → VALIDATION", async () => {
    const blusa = await f.variant("BLM022-BUR-3XL");
    const otra = await f.variant("PBA041-NEG-XL");
    const { result: t } = await createTransferCommand({
      actor: f.actors.bodega,
      fromLocationId: f.loc.BODEGA,
      toLocationId: f.loc.TIENDA_RANCAGUA,
      lines: [{ variantId: blusa, qty: 1 }],
      idempotencyKey: newKey(),
    });
    await sendTransferCommand({ actor: f.actors.bodega, transferId: t.id, idempotencyKey: newKey() });
    await expectAppError(sendTransferCommand({ actor: f.actors.bodega, transferId: t.id, idempotencyKey: newKey() }), "CONFLICT", /en tránsito/);

    await expectAppError(
      receiveTransferCommand({ actor: f.actors.vendRga, transferId: t.id, lines: [{ variantId: otra, qty: 1 }], idempotencyKey: newKey() }),
      "VALIDATION",
      /Esta prenda no viene en el traspaso\. Sepárala y avisa a Belén\./,
    );
    await receiveTransferCommand({ actor: f.actors.vendRga, transferId: t.id, lines: [{ variantId: blusa, qty: 1 }], idempotencyKey: newKey() });
    await expectAppError(
      receiveTransferCommand({ actor: f.actors.vendRga, transferId: t.id, lines: [{ variantId: blusa, qty: 1 }], idempotencyKey: newKey() }),
      "CONFLICT",
    );
    expect(await stockOf(blusa, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 0 });
    await expectInvariants();
  });

  it("origen y destino iguales → VALIDATION", async () => {
    const blusa = await f.variant("BLM022-BUR-3XL");
    await expectAppError(
      createTransferCommand({
        actor: f.actors.bodega,
        fromLocationId: f.loc.BODEGA,
        toLocationId: f.loc.BODEGA,
        lines: [{ variantId: blusa, qty: 1 }],
        idempotencyKey: newKey(),
      }),
      "VALIDATION",
    );
  });
});

describe("traspaso ligado a pedido online (tienda → bodega)", () => {
  it("al enviar la reserva de la tienda queda TRASPASADA; al recibir nace una reserva firme en bodega", async () => {
    const v = await f.variant("CPU053-NEG-2XL"); // Rancagua 3, Bodega 0
    const { orderId, orderLineId } = await createOrderLineFixture(f, v, f.loc.TIENDA_RANCAGUA);
    const [storeRes] = await tx((t) =>
      reserve(t, { actor: f.actors.belen, lines: [{ variantId: v, locationId: f.loc.TIENDA_RANCAGUA, qty: 1, orderLineId }] }),
    );
    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 3, reserved: 1 });

    const { result: t } = await createTransferCommand({
      actor: f.actors.belen,
      fromLocationId: f.loc.TIENDA_RANCAGUA,
      toLocationId: f.loc.BODEGA,
      reason: "PEDIDO_ONLINE",
      onlineOrderId: orderId,
      lines: [{ variantId: v, qty: 1, orderLineId, reservationId: storeRes.id }],
      idempotencyKey: newKey(),
    });
    await sendTransferCommand({ actor: f.actors.vendRga, transferId: t.id, idempotencyKey: newKey() });
    expect(await stockOf(v, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 2, reserved: 0 });
    expect(await db.reservation.findUniqueOrThrow({ where: { id: storeRes.id } })).toMatchObject({
      status: "TRASPASADA",
      transferLineId: t.lines[0].id,
    });
    await expectInvariants();

    await receiveTransferCommand({ actor: f.actors.bodega, transferId: t.id, lines: [{ variantId: v, qty: 1 }], idempotencyKey: newKey() });
    expect(await stockOf(v, f.loc.BODEGA)).toEqual({ onHand: 1, reserved: 1 });
    const bodegaRes = await db.reservation.findFirstOrThrow({ where: { locationId: f.loc.BODEGA, orderLineId } });
    expect(bodegaRes).toMatchObject({ status: "ACTIVA", quantity: 1, expiresAt: null });
    await expectInvariants();
  });
});
