import type { Tx } from "@/lib/db";
import { assertAccess } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { lineKey } from "@/lib/idempotency";
import { parseInput } from "@/lib/validation";
import { MovementType, RefType, TransferStatus } from "@/generated/prisma/client";
import { insufficientStock, recordMovement } from "./internal";
import { resolveTransferSchema } from "./schemas";
import { addOnHand, takeAvailable } from "./stock-sql";
import { createTransfer, getTransfer, STATUS_LABEL } from "./transfers";
import type { Actor, DifferenceResolution, MovementRecord, ResolveTransferResult, TransferRecord } from "./types";

// Resolución de diferencias de un traslado (RN-30, solo ADMIN). Con d = enviado − recibido, por línea:
//
//   Faltante (d > 0)  MERMA        sin cambio de stock (ya salió del origen y nunca entró al destino) y sin
//                                  movimiento: inventory_movements exige quantity <> 0. Queda en la línea y en audit_log.
//                     REENVIO      AJUSTE +d en el origen (nunca viajó) y un traslado nuevo en BORRADOR con esas prendas.
//                     ERROR_ENVIO  AJUSTE +d en el origen (la guía anotó de más). Sin traslado nuevo.
//   Sobrante (d < 0)  ERROR_ENVIO  AJUSTE −|d| en el origen (salió más de lo anotado). Solo disponible: si no alcanza,
//                                  STOCK_INSUFICIENTE y Belén ajusta el origen antes. MERMA y REENVIO no aplican.
//
// El destino nunca se toca: ya sumó exactamente lo escaneado. El traslado pasa a CERRADO cuando todas las
// líneas con diferencia tienen resolución. Cada paso es un UPDATE condicional (línea sin resolución, traslado
// RECIBIDO_CON_DIFERENCIAS): resolver dos veces la misma línea → CONFLICT.

export const RESOLVE_ACTION = "TRANSFER_RESOLVE";

const RESOLUTION_LABEL: Record<DifferenceResolution, string> = {
  MERMA: "merma",
  REENVIO: "reenvío",
  ERROR_ENVIO: "error de envío",
};

export async function resolveTransferDifference(
  tx: Tx,
  input: {
    actor: Actor;
    transferId: string;
    resolutions: { lineId: string; resolution: DifferenceResolution }[];
    notes?: string;
    idempotencyKey: string;
  },
): Promise<ResolveTransferResult> {
  const { transferId, resolutions, notes, idempotencyKey } = parseInput(resolveTransferSchema, input);
  assertAccess(input.actor, { roles: ["ADMIN"] });

  const transfer = await getTransfer(tx, transferId);
  if (transfer.status !== TransferStatus.RECIBIDO_CON_DIFERENCIAS) {
    // Respuesta temprana y clara; la garantía real es el UPDATE condicional de más abajo.
    throw new AppError("CONFLICT", `El traslado ${transfer.number} está ${STATUS_LABEL[transfer.status]}; no tiene diferencias por resolver.`);
  }
  if (new Set(resolutions.map((r) => r.lineId)).size !== resolutions.length) {
    throw new AppError("VALIDATION", "Una línea no puede resolverse dos veces en la misma operación.");
  }

  const skus = new Map(
    (await tx.productVariant.findMany({ where: { id: { in: transfer.lines.map((l) => l.variantId) } }, select: { id: true, sku: true } })).map(
      (v) => [v.id, v.sku],
    ),
  );

  // Valida cada resolución contra la diferencia de su línea (antes de tocar nada).
  const plan = resolutions
    .map(({ lineId, resolution }) => {
      const line = transfer.lines.find((l) => l.id === lineId);
      if (!line) throw new AppError("VALIDATION", "La línea no pertenece a este traslado.", { lineId });
      const sku = skus.get(line.variantId) ?? line.variantId;
      if (line.qtyReceived === null || line.qtyReceived === line.qtySent) {
        throw new AppError("VALIDATION", `${sku} no tiene diferencia que resolver.`, { lineId });
      }
      const d = line.qtySent - line.qtyReceived; // > 0 faltante, < 0 sobrante
      if (d < 0 && resolution !== "ERROR_ENVIO") {
        throw new AppError(
          "VALIDATION",
          `${sku} llegó con ${-d} de más: solo se puede resolver como error de envío.`,
          { lineId, resolution },
        );
      }
      return { line, sku, resolution, d };
    })
    .sort((a, b) => (a.line.variantId < b.line.variantId ? -1 : a.line.variantId > b.line.variantId ? 1 : 0));

  // 1) Bloquea el traslado con un cambio condicional y deja constancia de quién resolvió y las notas.
  const note = notes || null;
  const locked = await tx.$executeRaw`
    UPDATE transfers
    SET resolved_by = ${input.actor.id},
        resolved_at = now(),
        resolution_notes = CASE
          WHEN ${note}::text IS NULL THEN resolution_notes
          WHEN resolution_notes IS NULL THEN ${note}::text
          ELSE resolution_notes || E'\n' || ${note}::text
        END,
        updated_at = now()
    WHERE id = ${transferId} AND status = 'RECIBIDO_CON_DIFERENCIAS'::transfer_status
  `;
  if (locked === 0) {
    const current = await getTransfer(tx, transferId);
    throw new AppError(
      "CONFLICT",
      `El traslado ${current.number} está ${STATUS_LABEL[current.status]}; no tiene diferencias por resolver.`,
    );
  }

  // 2) Marca cada línea (condicional: solo si aún no tiene resolución) y aplica su efecto en el stock.
  const movements: MovementRecord[] = [];
  const reship: { variantId: string; qty: number }[] = [];
  let n = 0;
  for (const { line, sku, resolution, d } of plan) {
    const { count } = await tx.transferLine.updateMany({
      where: { id: line.id, transferId, differenceResolution: null },
      data: { differenceResolution: resolution },
    });
    if (count === 0) throw new AppError("CONFLICT", `${sku} ya tiene una resolución.`, { lineId: line.id });

    if (resolution === "MERMA") continue; // sin movimiento (CHECK quantity <> 0)

    const delta = d; // faltante: +d en el origen · sobrante: d es negativo → baja en el origen
    const reason =
      d > 0
        ? `Resolución ${transfer.number}: ${RESOLUTION_LABEL[resolution]}, ${d} prenda(s) siguen en el origen`
        : `Resolución ${transfer.number}: error de envío, salieron ${-d} prenda(s) de más`;
    let row;
    if (delta > 0) {
      row = await addOnHand(tx, line.variantId, transfer.fromLocationId, delta);
    } else {
      row = await takeAvailable(tx, line.variantId, transfer.fromLocationId, -delta);
      if (!row) throw await insufficientStock(tx, line.variantId, transfer.fromLocationId, -delta);
    }
    movements.push(
      await recordMovement(tx, {
        variantId: line.variantId,
        locationId: transfer.fromLocationId,
        type: MovementType.AJUSTE,
        quantity: delta,
        onHandAfter: row.onHand,
        at: row.at,
        refType: RefType.TRANSFER,
        refId: transfer.id,
        reason,
        userId: input.actor.id,
        idempotencyKey: lineKey(idempotencyKey, n++),
      }),
    );
    if (resolution === "REENVIO") reship.push({ variantId: line.variantId, qty: d });
  }

  // 3) REENVIO: un único traslado nuevo en BORRADOR con todas las prendas que quedaron en el origen.
  let reshipTransfer: TransferRecord | null = null;
  if (reship.length > 0) {
    reshipTransfer = await createTransfer(tx, {
      actor: input.actor,
      fromLocationId: transfer.fromLocationId,
      toLocationId: transfer.toLocationId,
      reason: "OTRO",
      lines: reship,
      idempotencyKey: reshipKey(idempotencyKey),
    });
    await tx.transfer.update({
      where: { id: reshipTransfer.id },
      data: { resolutionNotes: `Reenvío de lo que faltó en ${transfer.number}.` },
    });
  }

  // 4) Cierra el traslado si ya no quedan líneas con diferencia sin resolver.
  const after = await getTransfer(tx, transferId);
  const pending = after.lines.filter((l) => l.qtyReceived !== l.qtySent && l.differenceResolution === null).length;
  if (pending === 0) {
    await tx.transfer.updateMany({
      where: { id: transferId, status: TransferStatus.RECIBIDO_CON_DIFERENCIAS },
      data: { status: TransferStatus.CERRADO },
    });
  }

  // 5) Auditoría (acción sensible, regla 9). Es también el registro que usa la idempotencia de esta operación.
  await tx.auditLog.create({
    data: {
      userId: input.actor.id,
      locationId: transfer.fromLocationId,
      action: RESOLVE_ACTION,
      entity: "transfer",
      entityId: transferId,
      before: { status: TransferStatus.RECIBIDO_CON_DIFERENCIAS },
      after: {
        idempotencyKey,
        number: transfer.number,
        closed: pending === 0,
        notes: notes ?? null,
        reshipTransferId: reshipTransfer?.id ?? null,
        lines: plan.map((p) => ({ lineId: p.line.id, sku: p.sku, resolution: p.resolution, difference: p.d })),
      },
    },
  });

  return { transfer: await getTransfer(tx, transferId), movements, reshipTransfer };
}

export function reshipKey(idempotencyKey: string): string {
  return `${idempotencyKey}:reenvio`;
}
