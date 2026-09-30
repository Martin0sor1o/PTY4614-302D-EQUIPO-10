import type { Tx } from "@/lib/db";
import { assertAccess, type Role } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { lineKey } from "@/lib/idempotency";
import { parseInput } from "@/lib/validation";
import { MovementType, RefType, ReservationStatus, TransferStatus } from "@/generated/prisma/client";
import { nextDocumentNumber } from "@/modules/numbering";
import { assertVariantsExist, getActiveLocation, insufficientStock, recordMovement } from "./internal";
import { normalizeLines } from "./lines";
import { createTransferSchema, receiveTransferSchema, sendTransferSchema } from "./schemas";
import { addOnHand, takeAvailable, takeReserved } from "./stock-sql";
import type { Actor, MovementRecord, TransferOperationResult, TransferRecord } from "./types";

// Traspasos (CLAUDE.md regla 3b): el stock baja en origen al ENVIAR y sube en destino al RECIBIR lo escaneado.
// Las diferencias quedan registradas en el traspaso; no se ajustan solas. "En tránsito" se calcula.
// Cada cambio de estado es un UPDATE condicional (WHERE status = …): enviar o recibir dos veces → CONFLICT.

const ANY_ROLE: readonly Role[] = ["ADMIN", "VENDEDORA", "BODEGA"];

const STATUS_LABEL: Record<TransferStatus, string> = {
  BORRADOR: "borrador",
  EN_TRANSITO: "en tránsito",
  RECIBIDO: "recibido",
  RECIBIDO_CON_DIFERENCIAS: "recibido con diferencias",
  CERRADO: "cerrado",
  ANULADO: "anulado",
};

const transferSelect = {
  id: true,
  number: true,
  fromLocationId: true,
  toLocationId: true,
  status: true,
  reason: true,
  lines: {
    select: { id: true, variantId: true, qtySent: true, qtyReceived: true, orderLineId: true, reservationId: true },
    orderBy: { variantId: "asc" },
  },
} as const;

export async function getTransfer(tx: Pick<Tx, "transfer">, transferId: string): Promise<TransferRecord> {
  const t = await tx.transfer.findUnique({ where: { id: transferId }, select: transferSelect });
  if (!t) throw new AppError("NOT_FOUND", "El traspaso no existe.", { transferId });
  return t;
}

function byVariant<T extends { variantId: string }>(a: T, b: T): number {
  return a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0;
}

/** Crea el traspaso en BORRADOR (no mueve stock). Lo crea alguien de la ubicación de ORIGEN (o ADMIN). */
export async function createTransfer(
  tx: Tx,
  input: {
    actor: Actor;
    fromLocationId: string;
    toLocationId: string;
    reason?: "REPOSICION" | "PEDIDO_ONLINE" | "DEVOLUCION_A_BODEGA" | "OTRO";
    onlineOrderId?: string;
    lines: { variantId: string; qty: number; orderLineId?: string; reservationId?: string }[];
    idempotencyKey: string;
  },
): Promise<TransferRecord> {
  const data = parseInput(createTransferSchema, input);
  assertAccess(input.actor, { roles: ANY_ROLE, locationId: data.fromLocationId });
  await getActiveLocation(tx, data.fromLocationId);
  await getActiveLocation(tx, data.toLocationId);
  await assertVariantsExist(tx, data.lines.map((l) => l.variantId));

  // Líneas simples: se agrupan por variante. Líneas ligadas a pedido/reserva: una por variante, tal cual.
  type Line = { variantId: string; qty: number; orderLineId?: string; reservationId?: string };
  const linked: Line[] = data.lines.filter((l) => l.orderLineId || l.reservationId);
  const plain: Line[] = normalizeLines(data.lines.filter((l) => !l.orderLineId && !l.reservationId));
  const lines = [...plain, ...linked].sort(byVariant);
  if (new Set(lines.map((l) => l.variantId)).size !== lines.length) {
    throw new AppError("VALIDATION", "Una prenda ligada a un pedido no puede repetirse en el mismo traspaso.");
  }

  for (const l of linked) {
    if (!l.reservationId) continue;
    const r = await tx.reservation.findUnique({ where: { id: l.reservationId } });
    if (
      !r ||
      r.status !== ReservationStatus.ACTIVA ||
      r.locationId !== data.fromLocationId ||
      r.variantId !== l.variantId ||
      r.quantity !== l.qty
    ) {
      throw new AppError("VALIDATION", "La reserva indicada no corresponde a esta prenda, cantidad y ubicación de origen.", {
        reservationId: l.reservationId,
      });
    }
  }

  const number = await nextDocumentNumber(tx, "TRANSFER", "TR");
  return tx.transfer.create({
    data: {
      number,
      fromLocationId: data.fromLocationId,
      toLocationId: data.toLocationId,
      reason: data.reason,
      onlineOrderId: data.onlineOrderId ?? null,
      status: TransferStatus.BORRADOR,
      createdBy: input.actor.id,
      idempotencyKey: data.idempotencyKey,
      lines: {
        create: lines.map((l) => ({
          variantId: l.variantId,
          qtySent: l.qty,
          orderLineId: l.orderLineId ?? null,
          reservationId: l.reservationId ?? null,
        })),
      },
    },
    select: transferSelect,
  });
}

/** Busca un traspaso por la idempotencyKey con que se CREÓ (para reintentos de createTransfer). */
export async function findTransferByIdempotencyKey(tx: Pick<Tx, "transfer">, idempotencyKey: string): Promise<TransferRecord | null> {
  return tx.transfer.findUnique({ where: { idempotencyKey }, select: transferSelect });
}

/**
 * ENVIAR: BORRADOR → EN_TRANSITO y baja el stock del origen. Si la línea trae reserva (pedido online), la
 * reserva pasa a TRASPASADA y se descuenta de lo reservado; si no, se descuenta del disponible.
 * Orden de bloqueo: traspaso → reservas (por variante) → stock (por variante).
 */
export async function sendTransfer(
  tx: Tx,
  input: { actor: Actor; transferId: string; idempotencyKey: string },
): Promise<TransferOperationResult> {
  const { transferId, idempotencyKey } = parseInput(sendTransferSchema, input);
  const transfer = await getTransfer(tx, transferId);
  assertAccess(input.actor, { roles: ANY_ROLE, locationId: transfer.fromLocationId });

  const { count } = await tx.transfer.updateMany({
    where: { id: transferId, status: TransferStatus.BORRADOR },
    data: { status: TransferStatus.EN_TRANSITO, sentBy: input.actor.id, sentAt: new Date() },
  });
  if (count === 0) {
    const current = await getTransfer(tx, transferId);
    throw new AppError("CONFLICT", `El traspaso ${current.number} ya está ${STATUS_LABEL[current.status]}; no se puede enviar.`);
  }

  const lines = [...transfer.lines].sort(byVariant);
  for (const line of lines) {
    if (!line.reservationId) continue;
    const { count: closed } = await tx.reservation.updateMany({
      where: {
        id: line.reservationId,
        status: ReservationStatus.ACTIVA,
        locationId: transfer.fromLocationId,
        variantId: line.variantId,
        quantity: line.qtySent,
      },
      data: { status: ReservationStatus.TRASPASADA, closedAt: new Date(), transferLineId: line.id },
    });
    if (closed === 0) throw new AppError("CONFLICT", "La reserva de una prenda del traspaso ya no está activa.", { lineId: line.id });
  }

  const movements: MovementRecord[] = [];
  for (const [n, line] of lines.entries()) {
    const row = line.reservationId
      ? await takeReserved(tx, line.variantId, transfer.fromLocationId, line.qtySent)
      : await takeAvailable(tx, line.variantId, transfer.fromLocationId, line.qtySent);
    if (!row) throw await insufficientStock(tx, line.variantId, transfer.fromLocationId, line.qtySent);
    movements.push(
      await recordMovement(tx, {
        variantId: line.variantId,
        locationId: transfer.fromLocationId,
        type: MovementType.TRASPASO_SALIDA,
        quantity: -line.qtySent,
        onHandAfter: row.onHand,
        at: row.at,
        refType: RefType.TRANSFER,
        refId: transfer.id,
        reason: `Traspaso ${transfer.number}`,
        userId: input.actor.id,
        idempotencyKey: lineKey(idempotencyKey, n),
      }),
    );
  }
  return { transfer: await getTransfer(tx, transferId), movements };
}

/**
 * RECIBIR: EN_TRANSITO → RECIBIDO (cuadra) o RECIBIDO_CON_DIFERENCIAS. Sube en destino SOLO lo escaneado.
 * Si la línea está ligada a un pedido, lo recibido (hasta lo enviado) queda como reserva firme en destino.
 * Las diferencias quedan en qty_sent vs qty_received hasta que ADMIN las resuelva (Etapa 4).
 */
export async function receiveTransfer(
  tx: Tx,
  input: { actor: Actor; transferId: string; lines: { variantId: string; qty: number }[]; idempotencyKey: string },
): Promise<TransferOperationResult> {
  const { transferId, lines: scannedLines, idempotencyKey } = parseInput(receiveTransferSchema, input);
  const transfer = await getTransfer(tx, transferId);
  assertAccess(input.actor, { roles: ANY_ROLE, locationId: transfer.toLocationId });

  const scanned = new Map<string, number>();
  for (const l of scannedLines) scanned.set(l.variantId, (scanned.get(l.variantId) ?? 0) + l.qty);
  const inTransfer = new Set(transfer.lines.map((l) => l.variantId));
  for (const variantId of scanned.keys()) {
    if (!inTransfer.has(variantId)) {
      throw new AppError("VALIDATION", "Escaneaste una prenda que no viene en este traspaso.", { variantId });
    }
  }

  const lines = [...transfer.lines].sort(byVariant).map((l) => ({ ...l, received: scanned.get(l.variantId) ?? 0 }));
  const hasDifferences = lines.some((l) => l.received !== l.qtySent);

  const { count } = await tx.transfer.updateMany({
    where: { id: transferId, status: TransferStatus.EN_TRANSITO },
    data: {
      status: hasDifferences ? TransferStatus.RECIBIDO_CON_DIFERENCIAS : TransferStatus.RECIBIDO,
      receivedBy: input.actor.id,
      receivedAt: new Date(),
    },
  });
  if (count === 0) {
    const current = await getTransfer(tx, transferId);
    throw new AppError("CONFLICT", `El traspaso ${current.number} ya está ${STATUS_LABEL[current.status]}; no se puede recibir.`);
  }

  const movements: MovementRecord[] = [];
  for (const [n, line] of lines.entries()) {
    await tx.transferLine.update({ where: { id: line.id }, data: { qtyReceived: line.received } });
    if (line.received === 0) continue;

    const reserveQty = line.orderLineId ? Math.min(line.received, line.qtySent) : 0;
    const row = await addOnHand(tx, line.variantId, transfer.toLocationId, line.received, reserveQty);
    movements.push(
      await recordMovement(tx, {
        variantId: line.variantId,
        locationId: transfer.toLocationId,
        type: MovementType.TRASPASO_ENTRADA,
        quantity: line.received,
        onHandAfter: row.onHand,
        at: row.at,
        refType: RefType.TRANSFER,
        refId: transfer.id,
        reason: `Traspaso ${transfer.number}`,
        userId: input.actor.id,
        idempotencyKey: lineKey(idempotencyKey, n),
      }),
    );
    if (reserveQty > 0) {
      await tx.reservation.create({
        data: {
          variantId: line.variantId,
          locationId: transfer.toLocationId,
          quantity: reserveQty,
          status: ReservationStatus.ACTIVA,
          orderLineId: line.orderLineId,
          expiresAt: null, // firme: el pedido ya está pagado
          createdBy: input.actor.id,
        },
      });
    }
  }
  return { transfer: await getTransfer(tx, transferId), movements };
}
