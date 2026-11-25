import { z } from "zod";
import type { Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { formatDate } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { formatCLP } from "@/lib/money";
import { parseInput } from "@/lib/validation";
import { clearFailures, hmacForThrottle, reserveAttempt } from "@/modules/auth";
import { normalizeVoucherCode } from "./code";
import { codeTail, LOOKUP_LOCK_MINUTES, LOOKUP_MAX_ATTEMPTS, ROLES } from "./internal";
import type { RedeemResult } from "./types";

/**
 * Busca un vale POR CÓDIGO con límite de intentos (ADR-021): el código es una credencial al portador, así que adivinarlo
 * se frena igual que el código de vinculación de un equipo. Cada búsqueda se CUENTA antes de mirar la tabla (clave HMAC por
 * usuario en `auth_throttles`, nunca el id en claro); un acierto reinicia el contador. Tras `LOOKUP_MAX_ATTEMPTS` fallos
 * seguidos, el usuario queda bloqueado `LOOKUP_LOCK_MINUTES` y ni siquiera se consulta la tabla.
 */
export async function resolveVoucherCode(tx: Pick<Tx, "voucher">, actor: Actor, code: string): Promise<{ id: string; code: string }> {
  assertAccess(actor, { roles: ROLES });
  const key = `voucher:${hmacForThrottle("voucher-lookup", actor.id)}`;
  const attempt = await reserveAttempt(key, LOOKUP_MAX_ATTEMPTS, LOOKUP_LOCK_MINUTES);
  if (!attempt.allowed) {
    throw new AppError("FORBIDDEN", `Demasiados códigos de vale incorrectos. Espera ${LOOKUP_LOCK_MINUTES} minutos e intenta de nuevo.`);
  }
  const normalized = normalizeVoucherCode(code);
  if (!normalized) throw new AppError("NOT_FOUND", "Ese código no tiene la forma de un vale (VAL-XXXX-XXXX-XXXX).");
  const voucher = await tx.voucher.findUnique({ where: { code: normalized }, select: { id: true, code: true } });
  if (!voucher) throw new AppError("NOT_FOUND", "No existe un vale con ese código.");
  await clearFailures(key);
  return voucher;
}

const redeemSchema = z.object({
  locationId: z.string().trim().min(1),
  voucherId: z.string().trim().min(1),
  maxAmount: z.number().int().min(1, "El monto a canjear debe ser mayor a $0").max(100_000_000),
  saleId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(8, "idempotencyKey inválida").max(200),
});

/** Por qué un vale no se puede usar ahora (null si se puede). Lo comparten la validación previa y el canje. */
function unusableReason(v: { code: string; balance: number; active: boolean; expired: boolean; expires_at: Date }): string | null {
  if (!v.active) return `El vale …${codeTail(v.code)} está desactivado y no se puede usar.`;
  if (v.expired) return `El vale …${codeTail(v.code)} venció el ${formatDate(v.expires_at)}.`;
  if (v.balance <= 0) return `El vale …${codeTail(v.code)} no tiene saldo.`;
  return null;
}

/**
 * VALIDACIÓN PREVIA (solo lectura, sin bloqueos): sirve únicamente para dar un mensaje temprano antes de abrir la transacción
 * de la venta. NO decide nada: entre esta lectura y la transacción el vale puede gastarse, vencer o desactivarse. Quien decide
 * es `redeemVoucher` dentro de la transacción (bloqueo + UPDATE atómico `balance >= monto`) y, como red final, los CHECK de la base.
 */
export async function assertVoucherUsable(reader: Pick<Tx, "$queryRaw">, voucherId: string): Promise<void> {
  const rows = await reader.$queryRaw<LockedVoucher[]>`
    SELECT code, balance, active, expires_at, (expires_at <= now()) AS expired FROM vouchers WHERE id = ${voucherId}`;
  const v = rows[0];
  if (!v) throw new AppError("NOT_FOUND", "El vale no existe.");
  const reason = unusableReason(v);
  if (reason) throw new AppError("VALIDATION", reason);
}

interface LockedVoucher {
  code: string;
  balance: number;
  active: boolean;
  expires_at: Date;
  expired: boolean;
}

/**
 * CANJE de un vale en una venta (uso parcial permitido): descuenta `min(saldo, maxAmount)` y deja el movimiento CANJE (−).
 * Una sola transacción, la de la venta. Anti doble gasto: la fila del vale se bloquea (FOR UPDATE), se decide el monto con
 * el saldo ya bloqueado y el UPDATE lleva la condición `balance >= monto` (regla 5): dos ventas simultáneas con el mismo
 * vale no pueden gastar más que el saldo (la segunda espera, ve el saldo restante y cobra solo eso, o falla si ya no queda).
 * Vencido, desactivado o sin saldo → rechazo con el motivo. Los códigos se buscan con `resolveVoucherCode` (con límite).
 */
export async function redeemVoucher(
  tx: Tx,
  input: { actor: Actor; locationId: string; voucherId: string; maxAmount: number; saleId: string; idempotencyKey: string },
): Promise<RedeemResult> {
  const data = parseInput(redeemSchema, input);
  assertAccess(input.actor, { roles: ROLES, locationId: data.locationId });

  const rows = await tx.$queryRaw<LockedVoucher[]>`
    SELECT code, balance, active, expires_at, (expires_at <= now()) AS expired
    FROM vouchers WHERE id = ${data.voucherId} FOR UPDATE`;
  const v = rows[0];
  if (!v) throw new AppError("NOT_FOUND", "El vale no existe.");
  const reason = unusableReason(v);
  if (reason) throw new AppError("VALIDATION", reason);

  const amount = Math.min(v.balance, data.maxAmount);
  const updated = await tx.$queryRaw<{ balance: number }[]>`
    UPDATE vouchers SET balance = balance - ${amount}, updated_at = now()
    WHERE id = ${data.voucherId} AND active AND expires_at > now() AND balance >= ${amount}
    RETURNING balance`;
  if (!updated[0]) {
    throw new AppError("CONFLICT", `El saldo del vale …${codeTail(v.code)} cambió mientras se cobraba (saldo ${formatCLP(v.balance)}). Intenta de nuevo.`);
  }
  const balanceAfter = updated[0].balance;

  await tx.voucherMovement.create({
    data: {
      voucherId: data.voucherId,
      type: "CANJE",
      amount: -amount,
      balanceAfter,
      refType: "SALE",
      refId: data.saleId,
      userId: input.actor.id,
      idempotencyKey: `${data.idempotencyKey}:canje`,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: input.actor.id,
      locationId: data.locationId,
      action: "VOUCHER_REDEEM",
      entity: "voucher",
      entityId: data.voucherId,
      before: { balance: balanceAfter + amount },
      after: { balance: balanceAfter, amount, saleId: data.saleId, codeEnd: codeTail(v.code) },
    },
  });
  return { voucherId: data.voucherId, amount, balanceAfter };
}

/**
 * REPOSICIÓN: al anular una venta pagada con vale, el saldo vuelve al vale (movimiento REPOSICION +). No extiende el
 * vencimiento. El UPDATE exige `balance + monto <= initial_amount`: nunca se repone más de lo que se canjeó.
 */
export async function restoreRedemption(
  tx: Tx,
  input: { actor: Actor; locationId: string; voucherId: string; amount: number; saleId: string; idempotencyKey: string },
): Promise<{ balanceAfter: number }> {
  assertAccess(input.actor, { roles: ROLES, locationId: input.locationId });
  const amount = parseInput(z.number().int().min(1), input.amount);
  const rows = await tx.$queryRaw<{ balance: number; code: string }[]>`
    UPDATE vouchers SET balance = balance + ${amount}, updated_at = now()
    WHERE id = ${input.voucherId} AND balance + ${amount} <= initial_amount
    RETURNING balance, code`;
  if (!rows[0]) throw new AppError("CONFLICT", "No se pudo reponer el saldo del vale (el saldo ya está completo o el vale no existe).");
  await tx.voucherMovement.create({
    data: {
      voucherId: input.voucherId,
      type: "REPOSICION",
      amount,
      balanceAfter: rows[0].balance,
      refType: "SALE",
      refId: input.saleId,
      userId: input.actor.id,
      idempotencyKey: `${input.idempotencyKey}:reposicion:${input.voucherId}`,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: input.actor.id,
      locationId: input.locationId,
      action: "VOUCHER_RESTORE",
      entity: "voucher",
      entityId: input.voucherId,
      before: { balance: rows[0].balance - amount },
      after: { balance: rows[0].balance, amount, saleId: input.saleId, codeEnd: codeTail(rows[0].code) },
    },
  });
  return { balanceAfter: rows[0].balance };
}
