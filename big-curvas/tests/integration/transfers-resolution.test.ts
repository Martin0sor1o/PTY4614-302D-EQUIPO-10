import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createTransferCommand,
  receiveTransferCommand,
  resolveTransferDifferenceCommand,
  sendTransferCommand,
  type TransferRecord,
} from "@/modules/inventory";
import { countMovements, expectAppError, expectInvariants, newKey, resetDemo, stockOf, type Fixtures } from "./helpers";

// RN-30: resolución de diferencias de traslado (solo Belén). d = enviado − recibido.

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const BLUSA = "BLM022-BUR-3XL"; // Bodega 5, Rancagua 0
const POLERA = "PBA041-NEG-XL"; // Bodega 20, Rancagua 5

/** Bodega → Tienda: envía `sent` y la tienda escanea `received` de cada prenda. Devuelve el traslado ya recibido. */
async function received(lines: { sku: string; sent: number; received: number }[]): Promise<TransferRecord> {
  const ids = await Promise.all(lines.map(async (l) => ({ ...l, variantId: await f.variant(l.sku) })));
  const { result: t } = await createTransferCommand({
    actor: f.actors.belen,
    fromLocationId: f.loc.BODEGA,
    toLocationId: f.loc.TIENDA_RANCAGUA,
    reason: "REPOSICION",
    lines: ids.map((l) => ({ variantId: l.variantId, qty: l.sent })),
    idempotencyKey: newKey("crear"),
  });
  await sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey("enviar") });
  const { result } = await receiveTransferCommand({
    actor: f.actors.vendRga,
    transferId: t.id,
    lines: ids.map((l) => ({ variantId: l.variantId, qty: l.received })),
    idempotencyKey: newKey("recibir"),
  });
  return result.transfer;
}

const lineOf = (t: TransferRecord, variantId: string) => t.lines.find((l) => l.variantId === variantId)!;

describe("resolveTransferDifference", () => {
  it("faltante → MERMA: no mueve stock ni genera movimiento, queda en audit_log y el traslado pasa a CERRADO", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await received([{ sku: BLUSA, sent: 3, received: 2 }]);
    const movementsBefore = await db.inventoryMovement.count();

    const { result } = await resolveTransferDifferenceCommand({
      actor: f.actors.belen,
      transferId: t.id,
      resolutions: [{ lineId: lineOf(t, blusa).id, resolution: "MERMA" }],
      notes: "Se cayó una prenda del vehículo",
      idempotencyKey: newKey("resolver"),
    });
    expect(result.transfer.status).toBe("CERRADO");
    expect(lineOf(result.transfer, blusa).differenceResolution).toBe("MERMA");
    expect(result.movements).toEqual([]);
    expect(result.reshipTransfer).toBeNull();
    expect(await db.inventoryMovement.count()).toBe(movementsBefore);
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 0 });
    expect(await stockOf(blusa, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 2, reserved: 0 });

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "TRANSFER_RESOLVE", entityId: t.id } });
    expect(audit.userId).toBe(f.actors.belen.id);
    expect(audit.after).toMatchObject({ closed: true, lines: [{ resolution: "MERMA", difference: 1 }] });
    const row = await db.transfer.findUniqueOrThrow({ where: { id: t.id } });
    expect(row).toMatchObject({ resolvedBy: f.actors.belen.id, resolutionNotes: "Se cayó una prenda del vehículo" });
    expect(row.resolvedAt).not.toBeNull();
    await expectInvariants();
  });

  it("faltante → REENVIO: +d en el origen (AJUSTE) y un traslado nuevo en BORRADOR con esas prendas", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await received([{ sku: BLUSA, sent: 3, received: 1 }]);
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 0 });

    const { result } = await resolveTransferDifferenceCommand({
      actor: f.actors.belen,
      transferId: t.id,
      resolutions: [{ lineId: lineOf(t, blusa).id, resolution: "REENVIO" }],
      idempotencyKey: newKey("resolver"),
    });
    expect(result.transfer.status).toBe("CERRADO");
    expect(result.movements.map((m) => [m.type, m.quantity, m.locationId])).toEqual([["AJUSTE", 2, f.loc.BODEGA]]);
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 4, reserved: 0 });
    expect(await stockOf(blusa, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 0 });

    const reship = result.reshipTransfer!;
    expect(reship).toMatchObject({ status: "BORRADOR", fromLocationId: f.loc.BODEGA, toLocationId: f.loc.TIENDA_RANCAGUA });
    expect(reship.lines).toHaveLength(1);
    expect(reship.lines[0]).toMatchObject({ variantId: blusa, qtySent: 2 });
    expect(reship.number).not.toBe(t.number);
    await expectInvariants();

    // El reenvío sigue el flujo normal: se envía y baja el stock otra vez.
    await sendTransferCommand({ actor: f.actors.belen, transferId: reship.id, idempotencyKey: newKey("enviar") });
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 0 });
    await expectInvariants();
  });

  it("faltante → ERROR_ENVIO: +d en el origen (AJUSTE), sin traslado nuevo", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await received([{ sku: BLUSA, sent: 3, received: 2 }]);
    const transfersBefore = await db.transfer.count();

    const { result } = await resolveTransferDifferenceCommand({
      actor: f.actors.belen,
      transferId: t.id,
      resolutions: [{ lineId: lineOf(t, blusa).id, resolution: "ERROR_ENVIO" }],
      idempotencyKey: newKey("resolver"),
    });
    expect(result.transfer.status).toBe("CERRADO");
    expect(result.movements.map((m) => [m.type, m.quantity])).toEqual([["AJUSTE", 1]]);
    expect(result.reshipTransfer).toBeNull();
    expect(await db.transfer.count()).toBe(transfersBefore);
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 3, reserved: 0 });
    expect(await stockOf(blusa, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 2, reserved: 0 });
    await expectInvariants();
  });

  it("sobrante → ERROR_ENVIO: −|d| en el origen (AJUSTE) y el destino no se toca", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await received([{ sku: BLUSA, sent: 2, received: 3 }]);
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 3, reserved: 0 });

    const { result } = await resolveTransferDifferenceCommand({
      actor: f.actors.belen,
      transferId: t.id,
      resolutions: [{ lineId: lineOf(t, blusa).id, resolution: "ERROR_ENVIO" }],
      idempotencyKey: newKey("resolver"),
    });
    expect(result.transfer.status).toBe("CERRADO");
    expect(result.movements.map((m) => [m.type, m.quantity, m.locationId])).toEqual([["AJUSTE", -1, f.loc.BODEGA]]);
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 0 });
    expect(await stockOf(blusa, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 3, reserved: 0 });
    await expectInvariants();
  });

  it("sobrante con MERMA o REENVIO → VALIDATION; sobrante sin disponible en el origen → STOCK_INSUFICIENTE y nada cambia", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await received([{ sku: BLUSA, sent: 5, received: 6 }]); // la bodega quedó en 0
    const lineId = lineOf(t, blusa).id;
    for (const resolution of ["MERMA", "REENVIO"] as const) {
      await expectAppError(
        resolveTransferDifferenceCommand({ actor: f.actors.belen, transferId: t.id, resolutions: [{ lineId, resolution }], idempotencyKey: newKey() }),
        "VALIDATION",
        /de más/,
      );
    }
    await expectAppError(
      resolveTransferDifferenceCommand({ actor: f.actors.belen, transferId: t.id, resolutions: [{ lineId, resolution: "ERROR_ENVIO" }], idempotencyKey: newKey() }),
      "STOCK_INSUFICIENTE",
    );
    const row = await db.transfer.findUniqueOrThrow({ where: { id: t.id }, include: { lines: true } });
    expect(row.status).toBe("RECIBIDO_CON_DIFERENCIAS");
    expect(row.lines[0].differenceResolution).toBeNull();
    expect(row.resolvedBy).toBeNull();
    await expectInvariants();
  });

  it("resolución parcial: el traslado sigue abierto hasta resolver todas las líneas con diferencia; la línea sin diferencia no se resuelve", async () => {
    const blusa = await f.variant(BLUSA);
    const polera = await f.variant(POLERA);
    const t = await received([
      { sku: BLUSA, sent: 3, received: 2 },
      { sku: POLERA, sent: 4, received: 4 },
    ]);
    await expectAppError(
      resolveTransferDifferenceCommand({
        actor: f.actors.belen,
        transferId: t.id,
        resolutions: [{ lineId: lineOf(t, polera).id, resolution: "MERMA" }],
        idempotencyKey: newKey(),
      }),
      "VALIDATION",
      /no tiene diferencia/,
    );

    const t2 = await received([
      { sku: BLUSA, sent: 1, received: 0 },
      { sku: POLERA, sent: 3, received: 2 },
    ]);
    const first = await resolveTransferDifferenceCommand({
      actor: f.actors.belen,
      transferId: t2.id,
      resolutions: [{ lineId: lineOf(t2, blusa).id, resolution: "MERMA" }],
      idempotencyKey: newKey("r1"),
    });
    expect(first.result.transfer.status).toBe("RECIBIDO_CON_DIFERENCIAS");

    const second = await resolveTransferDifferenceCommand({
      actor: f.actors.belen,
      transferId: t2.id,
      resolutions: [{ lineId: lineOf(t2, polera).id, resolution: "ERROR_ENVIO" }],
      idempotencyKey: newKey("r2"),
    });
    expect(second.result.transfer.status).toBe("CERRADO");
    await expectInvariants();
  });

  it("varias líneas en una sola operación: un único borrador de reenvío y el ledger cuadra", async () => {
    const blusa = await f.variant(BLUSA);
    const polera = await f.variant(POLERA);
    const t = await received([
      { sku: BLUSA, sent: 3, received: 1 },
      { sku: POLERA, sent: 4, received: 3 },
    ]);
    const { result } = await resolveTransferDifferenceCommand({
      actor: f.actors.belen,
      transferId: t.id,
      resolutions: [
        { lineId: lineOf(t, blusa).id, resolution: "REENVIO" },
        { lineId: lineOf(t, polera).id, resolution: "REENVIO" },
      ],
      idempotencyKey: newKey("resolver"),
    });
    expect(result.transfer.status).toBe("CERRADO");
    expect(result.movements).toHaveLength(2);
    expect(result.reshipTransfer!.lines.map((l) => [l.variantId, l.qtySent]).sort()).toEqual(
      [[blusa, 2], [polera, 1]].sort(),
    );
    await expectInvariants();
  });

  it("resolver dos veces la misma línea (otra clave) → CONFLICT; con la misma clave devuelve lo ya hecho", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await received([{ sku: BLUSA, sent: 3, received: 1 }]);
    const key = newKey("resolver");
    const input = { actor: f.actors.belen, transferId: t.id, resolutions: [{ lineId: lineOf(t, blusa).id, resolution: "REENVIO" as const }], idempotencyKey: key };

    const first = await resolveTransferDifferenceCommand(input);
    const replay = await resolveTransferDifferenceCommand(input);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.result.transfer.status).toBe("CERRADO");
    expect(replay.result.movements.map((m) => m.id)).toEqual(first.result.movements.map((m) => m.id));
    expect(replay.result.reshipTransfer?.id).toBe(first.result.reshipTransfer?.id);
    expect(await countMovements({ variantId: blusa, type: "AJUSTE" })).toBe(1);
    expect(await db.transfer.count({ where: { status: "BORRADOR" } })).toBe(1);

    await expectAppError(resolveTransferDifferenceCommand({ ...input, idempotencyKey: newKey("otra") }), "CONFLICT", /cerrado/);
  });

  it("MERMA repetida con la misma clave también es idempotente (no deja movimientos)", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await received([{ sku: BLUSA, sent: 3, received: 2 }]);
    const input = {
      actor: f.actors.belen,
      transferId: t.id,
      resolutions: [{ lineId: lineOf(t, blusa).id, resolution: "MERMA" as const }],
      idempotencyKey: newKey("merma"),
    };
    expect((await resolveTransferDifferenceCommand(input)).replayed).toBe(false);
    expect((await resolveTransferDifferenceCommand(input)).replayed).toBe(true);
    expect(await db.auditLog.count({ where: { action: "TRANSFER_RESOLVE", entityId: t.id } })).toBe(1);
  });

  it("dos resoluciones simultáneas de la misma línea: una gana, la otra CONFLICT; el stock cambia una sola vez", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await received([{ sku: BLUSA, sent: 3, received: 1 }]);
    const lineId = lineOf(t, blusa).id;
    const results = await Promise.allSettled([
      resolveTransferDifferenceCommand({ actor: f.actors.belen, transferId: t.id, resolutions: [{ lineId, resolution: "ERROR_ENVIO" }], idempotencyKey: newKey("a") }),
      resolveTransferDifferenceCommand({ actor: f.actors.belen, transferId: t.id, resolutions: [{ lineId, resolution: "ERROR_ENVIO" }], idempotencyKey: newKey("b") }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "CONFLICT" });
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 4, reserved: 0 });
    await expectInvariants();
  });

  it("un traslado que no tiene diferencias (RECIBIDO, EN_TRANSITO) no se puede resolver", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await received([{ sku: BLUSA, sent: 2, received: 2 }]);
    await expectAppError(
      resolveTransferDifferenceCommand({
        actor: f.actors.belen,
        transferId: t.id,
        resolutions: [{ lineId: lineOf(t, blusa).id, resolution: "MERMA" }],
        idempotencyKey: newKey(),
      }),
      "CONFLICT",
    );
  });
});
