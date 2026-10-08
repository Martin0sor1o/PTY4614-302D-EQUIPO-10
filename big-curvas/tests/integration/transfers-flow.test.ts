import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/access";
import {
  cancelTransferCommand,
  countPendingTransfers,
  createTransferCommand,
  getStockMatrix,
  listTransfers,
  receiveTransferCommand,
  reserve,
  sendTransferCommand,
  updateTransferDraftCommand,
} from "@/modules/inventory";
import { countMovements, expectAppError, expectInvariants, newKey, resetDemo, stockOf, tx, type Fixtures } from "./helpers";

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

const BLUSA = "BLM022-BUR-3XL"; // Bodega 5, Rancagua 0
const POLERA = "PBA041-NEG-XL"; // Bodega 20, Rancagua 5

async function draft(actor: Actor, from: string, to: string, lines: { variantId: string; qty: number }[]) {
  const { result } = await createTransferCommand({ actor, fromLocationId: from, toLocationId: to, reason: "REPOSICION", lines, idempotencyKey: newKey("crear") });
  return result;
}

async function inTransitOf(variantId: string): Promise<number> {
  return (await getStockMatrix()).find((r) => r.variantId === variantId)!.inTransit;
}

/** Físico en todas las ubicaciones + en tránsito (el "Total" de la matriz de stock). */
async function totalOf(variantId: string): Promise<number> {
  return (await getStockMatrix()).find((r) => r.variantId === variantId)!.total;
}

describe("traslado Bodega → Tienda (flujo de Belén)", () => {
  it("enviar baja el stock del origen y aparece en tránsito; el total de la matriz cuadra antes y después", async () => {
    const blusa = await f.variant(BLUSA);
    const totalBefore = await totalOf(blusa);
    const t = await draft(f.actors.belen, f.loc.BODEGA, f.loc.TIENDA_RANCAGUA, [{ variantId: blusa, qty: 3 }]);
    expect(await inTransitOf(blusa)).toBe(0); // un borrador no es tránsito

    const { result: sent } = await sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey("enviar") });
    expect(sent.transfer.status).toBe("EN_TRANSITO");
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 0 });
    expect(await inTransitOf(blusa)).toBe(3);
    expect(await totalOf(blusa)).toBe(totalBefore);

    await receiveTransferCommand({ actor: f.actors.vendRga, transferId: t.id, lines: [{ variantId: blusa, qty: 3 }], idempotencyKey: newKey("recibir") });
    expect(await inTransitOf(blusa)).toBe(0);
    expect(await totalOf(blusa)).toBe(totalBefore);
    await expectInvariants();
  });

  it("enviar más que el disponible falla considerando lo reservado, y el traslado sigue en BORRADOR", async () => {
    const blusa = await f.variant(BLUSA);
    await tx((t) => reserve(t, { actor: f.actors.belen, lines: [{ variantId: blusa, locationId: f.loc.BODEGA, qty: 3 }] }));
    // 5 en bodega − 3 reservadas = 2 disponibles
    const t = await draft(f.actors.belen, f.loc.BODEGA, f.loc.TIENDA_RANCAGUA, [{ variantId: blusa, qty: 3 }]);
    await expectAppError(sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey() }), "STOCK_INSUFICIENTE", /disponible 2/);
    expect((await db.transfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("BORRADOR");
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 5, reserved: 3 });
    await expectInvariants();
  });

  it("recibir completo deja RECIBIDO", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await draft(f.actors.belen, f.loc.BODEGA, f.loc.TIENDA_RANCAGUA, [{ variantId: blusa, qty: 2 }]);
    await sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey() });
    const { result } = await receiveTransferCommand({
      actor: f.actors.vendRga,
      transferId: t.id,
      lines: [{ variantId: blusa, qty: 2 }],
      idempotencyKey: newKey(),
    });
    expect(result.transfer.status).toBe("RECIBIDO");
    expect(await stockOf(blusa, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 2, reserved: 0 });
  });

  it("recibir con un faltante deja RECIBIDO_CON_DIFERENCIAS y el destino suma solo lo escaneado (caso de la demo)", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await draft(f.actors.belen, f.loc.BODEGA, f.loc.TIENDA_RANCAGUA, [{ variantId: blusa, qty: 3 }]);
    await sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey() });
    const { result } = await receiveTransferCommand({
      actor: f.actors.vendRga,
      transferId: t.id,
      lines: [{ variantId: blusa, qty: 2 }],
      idempotencyKey: newKey(),
    });
    expect(result.transfer.status).toBe("RECIBIDO_CON_DIFERENCIAS");
    expect(result.transfer.lines[0]).toMatchObject({ qtySent: 3, qtyReceived: 2, differenceResolution: null });
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 2, reserved: 0 });
    expect(await stockOf(blusa, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 2, reserved: 0 });
    expect(await inTransitOf(blusa)).toBe(0); // la unidad faltante ya no está "en tránsito": espera a Belén
    await expectInvariants();
  });

  it("recibir con un sobrante de una prenda de la lista: acepta lo escaneado y deja la diferencia", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await draft(f.actors.belen, f.loc.BODEGA, f.loc.TIENDA_RANCAGUA, [{ variantId: blusa, qty: 2 }]);
    await sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey() });
    const { result } = await receiveTransferCommand({
      actor: f.actors.vendRga,
      transferId: t.id,
      lines: [{ variantId: blusa, qty: 3 }],
      idempotencyKey: newKey(),
    });
    expect(result.transfer.status).toBe("RECIBIDO_CON_DIFERENCIAS");
    expect(result.transfer.lines[0]).toMatchObject({ qtySent: 2, qtyReceived: 3 });
    expect(await stockOf(blusa, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 3, reserved: 0 });
    await expectInvariants();
  });

  it("una prenda ajena (que no viene en el traslado) se rechaza y no mueve stock", async () => {
    const blusa = await f.variant(BLUSA);
    const polera = await f.variant(POLERA);
    const t = await draft(f.actors.belen, f.loc.BODEGA, f.loc.TIENDA_RANCAGUA, [{ variantId: blusa, qty: 1 }]);
    await sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey() });
    await expectAppError(
      receiveTransferCommand({
        actor: f.actors.vendRga,
        transferId: t.id,
        lines: [
          { variantId: blusa, qty: 1 },
          { variantId: polera, qty: 1 },
        ],
        idempotencyKey: newKey(),
      }),
      "VALIDATION",
      /Esta prenda no viene en el traslado\. Sepárala y avisa a Belén\./,
    );
    expect((await db.transfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("EN_TRANSITO");
    expect(await stockOf(blusa, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 0, reserved: 0 });
    expect(await stockOf(polera, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 5, reserved: 0 });
  });

  it("enviar dos veces y recibir dos veces (otra clave) → CONFLICT", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await draft(f.actors.belen, f.loc.BODEGA, f.loc.TIENDA_RANCAGUA, [{ variantId: blusa, qty: 1 }]);
    await sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey() });
    await expectAppError(sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey() }), "CONFLICT");
    await receiveTransferCommand({ actor: f.actors.vendRga, transferId: t.id, lines: [{ variantId: blusa, qty: 1 }], idempotencyKey: newKey() });
    await expectAppError(
      receiveTransferCommand({ actor: f.actors.vendRga, transferId: t.id, lines: [{ variantId: blusa, qty: 1 }], idempotencyKey: newKey() }),
      "CONFLICT",
    );
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 4, reserved: 0 });
    expect(await stockOf(blusa, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 1, reserved: 0 });
    await expectInvariants();
  });

  it("idempotencia: enviar y recibir con la misma clave devuelven lo ya hecho, sin duplicar movimientos", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await draft(f.actors.belen, f.loc.BODEGA, f.loc.TIENDA_RANCAGUA, [{ variantId: blusa, qty: 2 }]);
    const sendKey = newKey("enviar");
    const first = await sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: sendKey });
    const again = await sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: sendKey });
    expect(first.replayed).toBe(false);
    expect(again.replayed).toBe(true);
    expect(again.result.movements.map((m) => m.id)).toEqual(first.result.movements.map((m) => m.id));

    const recvKey = newKey("recibir");
    const lines = [{ variantId: blusa, qty: 2 }];
    const r1 = await receiveTransferCommand({ actor: f.actors.vendRga, transferId: t.id, lines, idempotencyKey: recvKey });
    const r2 = await receiveTransferCommand({ actor: f.actors.vendRga, transferId: t.id, lines, idempotencyKey: recvKey });
    expect(r1.replayed).toBe(false);
    expect(r2.replayed).toBe(true);
    expect(await countMovements({ variantId: blusa, type: "TRASPASO_SALIDA" })).toBe(1);
    expect(await countMovements({ variantId: blusa, type: "TRASPASO_ENTRADA" })).toBe(1);
    expect(await stockOf(blusa, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 2, reserved: 0 });
  });

  it("dos envíos simultáneos del mismo borrador: uno gana y el otro recibe CONFLICT; el stock baja una sola vez", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await draft(f.actors.belen, f.loc.BODEGA, f.loc.TIENDA_RANCAGUA, [{ variantId: blusa, qty: 2 }]);
    const results = await Promise.allSettled([
      sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey("a") }),
      sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey("b") }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "CONFLICT" });
    expect(await stockOf(blusa, f.loc.BODEGA)).toEqual({ onHand: 3, reserved: 0 });
    await expectInvariants();
  });
});

describe("traslado Tienda → Bodega (flujo de la vendedora)", () => {
  it("la vendedora crea y envía desde la tienda; Belén recibe en la bodega", async () => {
    const polera = await f.variant(POLERA);
    const t = await draft(f.actors.vendRga, f.loc.TIENDA_RANCAGUA, f.loc.BODEGA, [{ variantId: polera, qty: 2 }]);
    await sendTransferCommand({ actor: f.actors.vendRga, transferId: t.id, idempotencyKey: newKey() });
    expect(await stockOf(polera, f.loc.TIENDA_RANCAGUA)).toEqual({ onHand: 3, reserved: 0 });
    const { result } = await receiveTransferCommand({
      actor: f.actors.belen,
      transferId: t.id,
      lines: [{ variantId: polera, qty: 2 }],
      idempotencyKey: newKey(),
    });
    expect(result.transfer.status).toBe("RECIBIDO");
    expect(await stockOf(polera, f.loc.BODEGA)).toEqual({ onHand: 22, reserved: 0 });
    await expectInvariants();
  });
});

describe("borradores: editar y anular", () => {
  it("editar reemplaza las prendas (agrupando repetidas) y no mueve stock", async () => {
    const blusa = await f.variant(BLUSA);
    const polera = await f.variant(POLERA);
    const t = await draft(f.actors.belen, f.loc.BODEGA, f.loc.TIENDA_RANCAGUA, [{ variantId: blusa, qty: 1 }]);
    const edited = await updateTransferDraftCommand({
      actor: f.actors.belen,
      transferId: t.id,
      lines: [
        { variantId: polera, qty: 1 },
        { variantId: polera, qty: 2 },
      ],
    });
    expect(edited.lines).toHaveLength(1);
    expect(edited.lines[0]).toMatchObject({ variantId: polera, qtySent: 3 });
    expect(await stockOf(polera, f.loc.BODEGA)).toEqual({ onHand: 20, reserved: 0 });
    expect(edited.status).toBe("BORRADOR");
  });

  it("anular deja ANULADO y queda en audit_log; luego no se puede enviar, editar ni anular (CONFLICT)", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await draft(f.actors.belen, f.loc.BODEGA, f.loc.TIENDA_RANCAGUA, [{ variantId: blusa, qty: 1 }]);
    const cancelled = await cancelTransferCommand({ actor: f.actors.belen, transferId: t.id, reason: "Me equivoqué de prenda" });
    expect(cancelled.status).toBe("ANULADO");
    expect(await db.auditLog.count({ where: { action: "TRANSFER_CANCEL", entityId: t.id } })).toBe(1);
    await expectAppError(sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey() }), "CONFLICT", /anulado/);
    await expectAppError(
      updateTransferDraftCommand({ actor: f.actors.belen, transferId: t.id, lines: [{ variantId: blusa, qty: 1 }] }),
      "CONFLICT",
    );
    await expectAppError(cancelTransferCommand({ actor: f.actors.belen, transferId: t.id }), "CONFLICT");
  });

  it("un traslado ya enviado no se edita ni se anula", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await draft(f.actors.belen, f.loc.BODEGA, f.loc.TIENDA_RANCAGUA, [{ variantId: blusa, qty: 1 }]);
    await sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey() });
    await expectAppError(updateTransferDraftCommand({ actor: f.actors.belen, transferId: t.id, lines: [{ variantId: blusa, qty: 2 }] }), "CONFLICT");
    await expectAppError(cancelTransferCommand({ actor: f.actors.belen, transferId: t.id }), "CONFLICT");
  });
});

describe("bandejas y alerta de tránsito", () => {
  it("por enviar / por recibir / historial por ubicación, y contadores del menú", async () => {
    const blusa = await f.variant(BLUSA);
    const polera = await f.variant(POLERA);
    const borrador = await draft(f.actors.belen, f.loc.BODEGA, f.loc.TIENDA_RANCAGUA, [{ variantId: blusa, qty: 1 }]);
    const enviado = await draft(f.actors.belen, f.loc.BODEGA, f.loc.TIENDA_RANCAGUA, [{ variantId: polera, qty: 1 }]);
    await sendTransferCommand({ actor: f.actors.belen, transferId: enviado.id, idempotencyKey: newKey() });

    expect((await listTransfers({ bucket: "por-enviar", locationId: f.loc.BODEGA })).map((t) => t.id)).toEqual([borrador.id]);
    expect(await listTransfers({ bucket: "por-enviar", locationId: f.loc.TIENDA_RANCAGUA })).toHaveLength(0);
    expect((await listTransfers({ bucket: "por-recibir", locationId: f.loc.TIENDA_RANCAGUA })).map((t) => t.id)).toEqual([enviado.id]);
    expect(await listTransfers({ bucket: "por-recibir", locationId: f.loc.BODEGA })).toHaveLength(0);
    expect((await listTransfers({ bucket: "historial", locationId: f.loc.BODEGA })).map((t) => t.id)).toEqual([enviado.id]); // enviados en tránsito

    expect(await countPendingTransfers({ locationId: f.loc.TIENDA_RANCAGUA, includeDifferences: false })).toMatchObject({ porEnviar: 0, porRecibir: 1, total: 1 });
    expect(await countPendingTransfers({ locationId: f.loc.BODEGA, includeDifferences: true })).toMatchObject({ porEnviar: 1, porRecibir: 0, conDiferencias: 0, total: 1 });
  });

  it("marca la alerta cuando el tránsito supera transfer_transit_alert_days (calculado al consultar)", async () => {
    const blusa = await f.variant(BLUSA);
    const t = await draft(f.actors.belen, f.loc.BODEGA, f.loc.TIENDA_RANCAGUA, [{ variantId: blusa, qty: 1 }]);
    await sendTransferCommand({ actor: f.actors.belen, transferId: t.id, idempotencyKey: newKey() });
    const sentAt = (await db.transfer.findUniqueOrThrow({ where: { id: t.id } })).sentAt!;
    const at = (days: number) => new Date(sentAt.getTime() + days * 86_400_000);

    const row = async (now: Date) => (await listTransfers({ bucket: "por-recibir", locationId: f.loc.TIENDA_RANCAGUA, now }))[0];
    expect(await row(at(2))).toMatchObject({ overdue: false, daysInTransit: 2 });
    expect(await row(at(3.5))).toMatchObject({ overdue: true, daysInTransit: 3 });

    await db.setting.update({ where: { key: "transfer_transit_alert_days" }, data: { valueInt: 5 } });
    expect(await row(at(3.5))).toMatchObject({ overdue: false });
    expect(await row(at(5.1))).toMatchObject({ overdue: true });
  });
});
