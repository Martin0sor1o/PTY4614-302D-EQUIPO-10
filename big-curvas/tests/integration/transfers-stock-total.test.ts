import { beforeEach, describe, expect, it } from "vitest";
import {
  createTransferCommand,
  getKardex,
  getStockMatrix,
  receiveTransferCommand,
  resolveTransferDifferenceCommand,
  sendTransferCommand,
} from "@/modules/inventory";
import { expectInvariants, newKey, resetDemo, type Fixtures } from "./helpers";

// Matriz de stock: Total = Rancagua + Bodega + En tránsito + Por resolver. "Por resolver" es solo lectura:
// un faltante de un traslado RECIBIDO_CON_DIFERENCIAS sin resolver no puede desaparecer del Total.

let f: Fixtures;
let blusa: string;
beforeEach(async () => {
  f = await resetDemo();
  blusa = await f.variant("BLM022-BUR-3XL"); // Bodega 5, Rancagua 0 → Total 5
});

async function row() {
  const r = (await getStockMatrix()).find((x) => x.variantId === blusa)!;
  const rga = r.byLocation[f.loc.TIENDA_RANCAGUA]?.onHand ?? 0;
  const bod = r.byLocation[f.loc.BODEGA]?.onHand ?? 0;
  // La identidad de la columna: el Total siempre es la suma de sus partes.
  expect(r.total).toBe(rga + bod + r.inTransit + r.pendingResolution);
  return { total: r.total, transit: r.inTransit, pending: r.pendingResolution, rga, bod };
}

/** Envía 3 desde la bodega y la tienda recibe 2: queda 1 faltante por resolver. Devuelve el traslado recibido. */
async function sendAndReceiveWithMissing() {
  const { result: t } = await createTransferCommand({
    actor: f.actors.belen,
    fromLocationId: f.loc.BODEGA,
    toLocationId: f.loc.TIENDA_RANCAGUA,
    lines: [{ variantId: blusa, qty: 3 }],
    idempotencyKey: newKey("crear"),
  });
  expect(await row()).toMatchObject({ total: 5, transit: 0, pending: 0 }); // el borrador no cambia nada

  await sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey("enviar") });
  expect(await row()).toMatchObject({ total: 5, transit: 3, pending: 0, bod: 2, rga: 0 });

  const { result } = await receiveTransferCommand({
    actor: f.actors.vendRga,
    transferId: t.id,
    lines: [{ variantId: blusa, qty: 2 }],
    idempotencyKey: newKey("recibir"),
  });
  expect(result.transfer.status).toBe("RECIBIDO_CON_DIFERENCIAS");
  // El faltante no desaparece: pasa de "En tránsito" a "Por resolver".
  expect(await row()).toMatchObject({ total: 5, transit: 0, pending: 1, bod: 2, rga: 2 });
  expect((await getKardex({ variantId: blusa })).pendingResolution).toBe(1);
  return result.transfer;
}

describe("matriz de stock: columna Por resolver", () => {
  it("REENVIO: el Total no cambia en ningún paso (el faltante vuelve al origen y el borrador no mueve stock)", async () => {
    const t = await sendAndReceiveWithMissing();
    const { result } = await resolveTransferDifferenceCommand({
      actor: f.actors.belen,
      transferId: t.id,
      resolutions: [{ lineId: t.lines[0].id, resolution: "REENVIO" }],
      idempotencyKey: newKey("resolver"),
    });
    expect(await row()).toMatchObject({ total: 5, transit: 0, pending: 0, bod: 3, rga: 2 });

    // El reenvío sigue el flujo normal y el Total tampoco cambia al enviarlo ni al recibirlo.
    const reship = result.reshipTransfer!;
    await sendTransferCommand({ actor: f.actors.belen, transferId: reship.id, idempotencyKey: newKey("enviar2") });
    expect(await row()).toMatchObject({ total: 5, transit: 1, pending: 0 });
    await receiveTransferCommand({ actor: f.actors.vendRga, transferId: reship.id, lines: [{ variantId: blusa, qty: 1 }], idempotencyKey: newKey("recibir2") });
    expect(await row()).toMatchObject({ total: 5, transit: 0, pending: 0, bod: 2, rga: 3 });
    await expectInvariants();
  });

  it("ERROR_ENVIO: el Total no cambia al resolver (el faltante vuelve al origen)", async () => {
    const t = await sendAndReceiveWithMissing();
    await resolveTransferDifferenceCommand({
      actor: f.actors.belen,
      transferId: t.id,
      resolutions: [{ lineId: t.lines[0].id, resolution: "ERROR_ENVIO" }],
      idempotencyKey: newKey("resolver"),
    });
    expect(await row()).toMatchObject({ total: 5, transit: 0, pending: 0, bod: 3, rga: 2 });
    await expectInvariants();
  });

  it("MERMA: el Total baja en lo perdido al resolver, y Por resolver vuelve a 0", async () => {
    const t = await sendAndReceiveWithMissing();
    await resolveTransferDifferenceCommand({
      actor: f.actors.belen,
      transferId: t.id,
      resolutions: [{ lineId: t.lines[0].id, resolution: "MERMA" }],
      idempotencyKey: newKey("resolver"),
    });
    expect(await row()).toMatchObject({ total: 4, transit: 0, pending: 0, bod: 2, rga: 2 });
    expect((await getKardex({ variantId: blusa })).pendingResolution).toBe(0);
    await expectInvariants();
  });

  it("una resolución parcial deja en Por resolver solo lo que falta resolver", async () => {
    const polera = await f.variant("PBA041-NEG-XL"); // Bodega 20, Rancagua 5
    const { result: t } = await createTransferCommand({
      actor: f.actors.belen,
      fromLocationId: f.loc.BODEGA,
      toLocationId: f.loc.TIENDA_RANCAGUA,
      lines: [
        { variantId: blusa, qty: 3 },
        { variantId: polera, qty: 4 },
      ],
      idempotencyKey: newKey("crear"),
    });
    await sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey("enviar") });
    const { result: received } = await receiveTransferCommand({
      actor: f.actors.vendRga,
      transferId: t.id,
      lines: [
        { variantId: blusa, qty: 1 },
        { variantId: polera, qty: 3 },
      ],
      idempotencyKey: newKey("recibir"),
    });
    const pendingOf = async (v: string) => (await getStockMatrix()).find((x) => x.variantId === v)!.pendingResolution;
    expect([await pendingOf(blusa), await pendingOf(polera)]).toEqual([2, 1]);

    const lineBlusa = received.transfer.lines.find((l) => l.variantId === blusa)!;
    await resolveTransferDifferenceCommand({
      actor: f.actors.belen,
      transferId: t.id,
      resolutions: [{ lineId: lineBlusa.id, resolution: "ERROR_ENVIO" }],
      idempotencyKey: newKey("resolver"),
    });
    expect([await pendingOf(blusa), await pendingOf(polera)]).toEqual([0, 1]);
  });

  it("sin faltantes pendientes, Por resolver es 0 en todas las prendas (la columna no se muestra)", async () => {
    const rows = await getStockMatrix();
    expect(rows.every((r) => r.pendingResolution === 0)).toBe(true);
  });
});
