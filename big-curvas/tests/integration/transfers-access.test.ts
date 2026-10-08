import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  cancelTransferCommand,
  createTransferCommand,
  receiveTransferCommand,
  resolveTransferDifferenceCommand,
  sendTransferCommand,
  updateTransferDraftCommand,
} from "@/modules/inventory";
import { expectAppError, expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";

// Acceso cruzado de los traslados (CLAUDE.md regla 10): rol Y ubicación, validado en el servicio.
// El rechazo no deja cambios de stock ni de estado.

let f: Fixtures;
let blusa: string;
beforeEach(async () => {
  f = await resetDemo();
  blusa = await f.variant("BLM022-BUR-3XL"); // Bodega 5, Rancagua 0
});

async function bodegaToStore(qty = 2) {
  const { result } = await createTransferCommand({
    actor: f.actors.belen,
    fromLocationId: f.loc.BODEGA,
    toLocationId: f.loc.TIENDA_RANCAGUA,
    lines: [{ variantId: blusa, qty }],
    idempotencyKey: newKey("crear"),
  });
  return result;
}

describe("acceso a traslados", () => {
  it("la vendedora no puede crear, editar, anular ni enviar un traslado que sale de BODEGA", async () => {
    await expectAppError(
      createTransferCommand({
        actor: f.actors.vendRga,
        fromLocationId: f.loc.BODEGA,
        toLocationId: f.loc.TIENDA_RANCAGUA,
        lines: [{ variantId: blusa, qty: 1 }],
        idempotencyKey: newKey(),
      }),
      "FORBIDDEN",
    );
    const t = await bodegaToStore();
    await expectAppError(updateTransferDraftCommand({ actor: f.actors.vendRga, transferId: t.id, lines: [{ variantId: blusa, qty: 1 }] }), "FORBIDDEN");
    await expectAppError(cancelTransferCommand({ actor: f.actors.vendRga, transferId: t.id }), "FORBIDDEN");
    await expectAppError(sendTransferCommand({ actor: f.actors.vendRga, transferId: t.id, idempotencyKey: newKey() }), "FORBIDDEN");
    expect((await db.transfer.findUniqueOrThrow({ where: { id: t.id }, include: { lines: true } })).lines[0].qtySent).toBe(2);
    expect((await db.transfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("BORRADOR");
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 5, reserved: 0 });
  });

  it("la vendedora no puede recibir en BODEGA", async () => {
    const { result: t } = await createTransferCommand({
      actor: f.actors.vendRga,
      fromLocationId: f.loc.TIENDA_RANCAGUA,
      toLocationId: f.loc.BODEGA,
      lines: [{ variantId: await f.variant("PBA041-NEG-XL"), qty: 1 }],
      idempotencyKey: newKey(),
    });
    const polera = t.lines[0].variantId;
    await sendTransferCommand({ actor: f.actors.vendRga, transferId: t.id, idempotencyKey: newKey() });
    await expectAppError(
      receiveTransferCommand({ actor: f.actors.vendRga, transferId: t.id, lines: [{ variantId: polera, qty: 1 }], idempotencyKey: newKey() }),
      "FORBIDDEN",
    );
    expect((await db.transfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("EN_TRANSITO");
    expect(await stockOf(polera, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 0 });
  });

  it("solo Belén resuelve diferencias: ni la vendedora ni el rol BODEGA", async () => {
    const t = await bodegaToStore(3);
    await sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey() });
    const { result } = await receiveTransferCommand({
      actor: f.actors.vendRga,
      transferId: t.id,
      lines: [{ variantId: blusa, qty: 2 }],
      idempotencyKey: newKey(),
    });
    const lineId = result.transfer.lines[0].id;
    for (const actor of [f.actors.vendRga, f.actors.vendRga2, f.actors.bodega]) {
      await expectAppError(
        resolveTransferDifferenceCommand({ actor, transferId: t.id, resolutions: [{ lineId, resolution: "ERROR_ENVIO" }], idempotencyKey: newKey() }),
        "FORBIDDEN",
      );
    }
    expect((await db.transfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("RECIBIDO_CON_DIFERENCIAS");
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 0 });
    await expectInvariants();
  });

  it("el rol BODEGA no opera en la tienda; Belén opera en ambas ubicaciones", async () => {
    await expectAppError(
      createTransferCommand({
        actor: f.actors.bodega,
        fromLocationId: f.loc.TIENDA_RANCAGUA,
        toLocationId: f.loc.BODEGA,
        lines: [{ variantId: blusa, qty: 1 }],
        idempotencyKey: newKey(),
      }),
      "FORBIDDEN",
    );

    // Belén: crea y envía desde la bodega, recibe en la tienda y viceversa
    const t = await bodegaToStore(1);
    await sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey() });
    await receiveTransferCommand({ actor: f.actors.belen, transferId: t.id, lines: [{ variantId: blusa, qty: 1 }], idempotencyKey: newKey() });
    const { result: back } = await createTransferCommand({
      actor: f.actors.belen,
      fromLocationId: f.loc.TIENDA_RANCAGUA,
      toLocationId: f.loc.BODEGA,
      lines: [{ variantId: blusa, qty: 1 }],
      idempotencyKey: newKey(),
    });
    await sendTransferCommand({ actor: f.actors.belen, transferId: back.id, idempotencyKey: newKey() });
    await receiveTransferCommand({ actor: f.actors.belen, transferId: back.id, lines: [{ variantId: blusa, qty: 1 }], idempotencyKey: newKey() });
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 5, reserved: 0 });
    await expectInvariants();
  });

  it("una prenda ajena y una cantidad inválida al editar un borrador → VALIDATION", async () => {
    const t = await bodegaToStore();
    await expectAppError(updateTransferDraftCommand({ actor: f.actors.belen, transferId: t.id, lines: [] }), "VALIDATION");
    await expectAppError(updateTransferDraftCommand({ actor: f.actors.belen, transferId: t.id, lines: [{ variantId: blusa, qty: 0 }] }), "VALIDATION");
  });
});
