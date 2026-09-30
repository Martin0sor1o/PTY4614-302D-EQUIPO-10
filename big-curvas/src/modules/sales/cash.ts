import { db, type Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { formatCLP } from "@/lib/money";
import { parseInput } from "@/lib/validation";
import { CashSessionStatus, PaymentMethod } from "@/generated/prisma/client";
import { emptyByMethod, getPosLocation, lockOpenCashSession, TX_OPTIONS } from "./internal";
import { cashDifference, expectedCash } from "./pricing";
import { closeCashSchema, openCashSchema } from "./schemas";
import type { CashClosingTotals, CashSessionView } from "./types";

// Caja por tienda (RF-POS-01, RF-POS-10). Una caja abierta por tienda: lo garantiza el índice único parcial
// cash_sessions_one_open_per_location_idx; la validación previa solo entrega un mensaje amable.

const ROLES = ["ADMIN", "VENDEDORA"] as const;

type Reader = Pick<Tx, "payment" | "sale">;

/** Totales de una caja: ventas COMPLETADAS de la sesión por medio de pago y efectivo esperado. */
export async function cashTotals(reader: Reader, sessionId: string, openingCash: number): Promise<CashClosingTotals> {
  // Secuencial: dentro de una transacción interactiva todas las consultas comparten una sola conexión.
  const rows = await reader.payment.groupBy({
    by: ["method"],
    where: { sale: { cashSessionId: sessionId, status: "COMPLETADA" } },
    _sum: { amount: true },
  });
  const salesCount = await reader.sale.count({ where: { cashSessionId: sessionId, status: "COMPLETADA" } });
  const byMethod = emptyByMethod();
  for (const r of rows) {
    if (r.method !== PaymentMethod.VALE) byMethod[r.method] += r._sum.amount ?? 0;
  }
  return { salesCount, byMethod, cashCollected: byMethod.EFECTIVO, expectedCash: expectedCash(openingCash, [byMethod.EFECTIVO]) };
}

const sessionInclude = { opener: { select: { name: true } }, closer: { select: { name: true } } } as const;

async function toView(
  reader: Reader,
  s: {
    id: string;
    locationId: string;
    openedAt: Date;
    openingCash: number;
    status: CashSessionStatus;
    closedAt: Date | null;
    expectedCash: number | null;
    countedCash: number | null;
    difference: number | null;
    notes: string | null;
    opener: { name: string };
    closer: { name: string } | null;
  },
): Promise<CashSessionView> {
  return {
    id: s.id,
    locationId: s.locationId,
    openedAt: s.openedAt,
    openedByName: s.opener.name,
    openingCash: s.openingCash,
    status: s.status,
    closedAt: s.closedAt,
    closedByName: s.closer?.name ?? null,
    expectedCash: s.expectedCash,
    countedCash: s.countedCash,
    difference: s.difference,
    notes: s.notes,
    salesCount: await reader.sale.count({ where: { cashSessionId: s.id, status: "COMPLETADA" } }),
  };
}

/** Caja abierta de la tienda (o null). */
export async function getOpenCashSession(actor: Actor, locationId: string): Promise<CashSessionView | null> {
  assertAccess(actor, { roles: ROLES, locationId });
  const s = await db.cashSession.findFirst({ where: { locationId, status: CashSessionStatus.ABIERTA }, include: sessionInclude });
  return s ? toView(db, s) : null;
}

/** Una caja (abierta o cerrada) de la ubicación del actor. */
export async function getCashSession(actor: Actor, sessionId: string): Promise<CashSessionView> {
  const s = await db.cashSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
  if (!s) throw new AppError("NOT_FOUND", "La caja no existe.");
  assertAccess(actor, { roles: ROLES, locationId: s.locationId });
  return toView(db, s);
}

export async function getCashClosingTotals(actor: Actor, sessionId: string): Promise<CashClosingTotals> {
  const s = await getCashSession(actor, sessionId);
  return cashTotals(db, s.id, s.openingCash);
}

export async function openCashSession(input: { actor: Actor; locationId: string; openingCash: number }): Promise<CashSessionView> {
  assertAccess(input.actor, { roles: ROLES, locationId: input.locationId });
  const { locationId, openingCash } = parseInput(openCashSchema, input);
  await getPosLocation(db, locationId);

  const alreadyOpen = () => db.cashSession.findFirst({ where: { locationId, status: CashSessionStatus.ABIERTA }, select: { id: true } });
  const conflict = () => new AppError("CONFLICT", "Ya hay una caja abierta en esta tienda.");
  if (await alreadyOpen()) throw conflict();

  try {
    const s = await db.cashSession.create({
      data: { locationId, openedBy: input.actor.id, openingCash },
      include: sessionInclude,
    });
    return toView(db, s);
  } catch (error) {
    // Dos aperturas simultáneas: la segunda choca con el índice único parcial.
    if (await alreadyOpen()) throw conflict();
    throw error;
  }
}

/**
 * Cierre de caja. Bloquea la fila de la sesión (FOR UPDATE): espera a las ventas en curso (que la tienen con
 * FOR SHARE) y las que lleguen después ya no encuentran caja abierta. Luego calcula lo esperado sobre datos
 * confirmados. Con diferencia ≠ 0 la observación es obligatoria (decisión de demo; pendiente con el cliente).
 */
export async function closeCashSession(input: {
  actor: Actor;
  locationId: string;
  countedCash: number;
  notes?: string;
}): Promise<CashSessionView> {
  assertAccess(input.actor, { roles: ROLES, locationId: input.locationId });
  const { locationId, countedCash, notes } = parseInput(closeCashSchema, input);

  return db.$transaction(async (tx) => {
    const locked = await lockOpenCashSession(tx, locationId, "update");
    if (!locked) throw new AppError("CONFLICT", "No hay una caja abierta en esta tienda.");

    const totals = await cashTotals(tx, locked.id, locked.openingCash);
    const difference = cashDifference(countedCash, totals.expectedCash);
    if (difference !== 0 && !notes) {
      throw new AppError(
        "VALIDATION",
        `La caja tiene una diferencia de ${formatCLP(difference)}. Escribe una observación para poder cerrarla.`,
        { needsNotes: true, difference, expectedCash: totals.expectedCash },
      );
    }

    const closed = await tx.cashSession.update({
      where: { id: locked.id },
      data: {
        status: CashSessionStatus.CERRADA,
        closedBy: input.actor.id,
        closedAt: new Date(),
        expectedCash: totals.expectedCash,
        countedCash,
        difference,
        notes: notes ?? null,
      },
      include: sessionInclude,
    });
    if (difference !== 0) {
      await tx.auditLog.create({
        data: {
          userId: input.actor.id,
          locationId,
          action: "CASH_CLOSE_WITH_DIFFERENCE",
          entity: "cash_session",
          entityId: locked.id,
          after: { expectedCash: totals.expectedCash, countedCash, difference, notes: notes ?? null },
        },
      });
    }
    return toView(tx, closed);
  }, TX_OPTIONS);
}
