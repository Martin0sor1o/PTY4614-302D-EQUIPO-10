import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import type { Prisma } from "@/generated/prisma/client";
import { ROLES, toView, viewSelect } from "./internal";
import { resolveVoucherCode } from "./redeem";
import type { VoucherMovementView, VoucherStatus, VoucherView } from "./types";

/** Consulta de un vale por su código (saldo y vencimiento) desde la caja. Con límite de intentos (resolveVoucherCode). */
export async function lookupVoucher(actor: Actor, code: string): Promise<VoucherView> {
  assertAccess(actor, { roles: ROLES });
  const found = await resolveVoucherCode(db, actor, code);
  const row = await db.voucher.findUniqueOrThrow({ where: { id: found.id }, select: viewSelect });
  return toView(row);
}

export type VoucherFilter = VoucherStatus | "TODOS";

const listSchema = z.object({
  status: z.enum(["VIGENTE", "AGOTADO", "VENCIDO", "INACTIVO", "TODOS"]).default("TODOS"),
  limit: z.number().int().min(1).max(500).default(200),
});

/** Vales para Belén (solo ADMIN): el estado se calcula con la hora de ahora. Más recientes primero. */
export async function listVouchers(input: { actor: Actor; status?: VoucherFilter; limit?: number; now?: Date }): Promise<VoucherView[]> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  const { status, limit } = parseInput(listSchema, { status: input.status, limit: input.limit });
  const now = input.now ?? new Date();
  const where: Prisma.VoucherWhereInput =
    status === "INACTIVO"
      ? { active: false }
      : status === "VENCIDO"
        ? { active: true, expiresAt: { lte: now } }
        : status === "AGOTADO"
          ? { active: true, expiresAt: { gt: now }, balance: { lte: 0 } }
          : status === "VIGENTE"
            ? { active: true, expiresAt: { gt: now }, balance: { gt: 0 } }
            : {};
  const rows = await db.voucher.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, select: viewSelect });
  return rows.map((r) => toView(r, now));
}

/** Historial de movimientos de un vale (solo ADMIN). */
export async function getVoucherLedger(actor: Actor, voucherId: string): Promise<{ voucher: VoucherView; movements: VoucherMovementView[] }> {
  assertAccess(actor, { roles: ["ADMIN"] });
  const row = await db.voucher.findUnique({ where: { id: voucherId }, select: viewSelect });
  if (!row) throw new AppError("NOT_FOUND", "El vale no existe.");
  const movements = await db.voucherMovement.findMany({
    where: { voucherId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { user: { select: { name: true } } },
  });
  return {
    voucher: toView(row),
    movements: movements.map((m) => ({
      id: m.id,
      type: m.type,
      amount: m.amount,
      balanceAfter: m.balanceAfter,
      refType: m.refType,
      refId: m.refId,
      userName: m.user.name,
      createdAt: m.createdAt,
    })),
  };
}

export interface VoucherLedgerMismatch {
  code: string;
  balance: number;
  initialAmount: number;
  movementsSum: number;
  emissions: number;
}

/**
 * Invariante de los vales: saldo = monto inicial + movimientos posteriores a la emisión = suma de todos los movimientos,
 * con una sola EMISION por el monto inicial. Devuelve los vales que NO cuadran (vacío = todo bien). Solo lectura; lo
 * usan los tests y, en SQL, scripts/verify-db.sql.
 */
export async function findVoucherLedgerMismatches(reader: Pick<Tx, "$queryRaw"> = db): Promise<VoucherLedgerMismatch[]> {
  const rows = await reader.$queryRaw<
    { code: string; balance: number; initial_amount: number; movements_sum: bigint | number; emissions: bigint | number }[]
  >`
    SELECT v.code, v.balance, v.initial_amount,
           COALESCE((SELECT sum(m.amount) FROM voucher_movements m WHERE m.voucher_id = v.id), 0) AS movements_sum,
           (SELECT count(*) FROM voucher_movements m WHERE m.voucher_id = v.id AND m.type = 'EMISION' AND m.amount = v.initial_amount) AS emissions
    FROM vouchers v
    WHERE v.balance <> v.initial_amount + COALESCE((SELECT sum(m.amount) FROM voucher_movements m WHERE m.voucher_id = v.id AND m.type <> 'EMISION'), 0)
       OR v.balance <> COALESCE((SELECT sum(m.amount) FROM voucher_movements m WHERE m.voucher_id = v.id), 0)
       OR (SELECT count(*) FROM voucher_movements m WHERE m.voucher_id = v.id AND m.type = 'EMISION' AND m.amount = v.initial_amount) <> 1
    ORDER BY v.code`;
  return rows.map((r) => ({
    code: r.code,
    balance: r.balance,
    initialAmount: r.initial_amount,
    movementsSum: Number(r.movements_sum),
    emissions: Number(r.emissions),
  }));
}
