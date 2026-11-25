import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { isDemoMode } from "@/lib/demo";
import { AppError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import { generateVoucherCode, normalizeVoucherCode } from "./code";
import { codeTail, getValidityDays, ROLES } from "./internal";
import type { IssuedVoucher } from "./types";

const schema = z.object({
  locationId: z.string().trim().min(1),
  amount: z.number().int("El monto del vale debe ser entero en pesos").min(1, "El vale debe ser de al menos $1").max(100_000_000),
  returnId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(8, "idempotencyKey inválida").max(200),
});

const MAX_CODE_TRIES = 5;

/**
 * Emite un vale (ADR-021, RN-16): fila con saldo = monto inicial + movimiento EMISION (+monto), en la transacción de
 * quien llama (`returns`). Código aleatorio de alta entropía (`code.ts`); si choca con otro (casi imposible) se reintenta
 * con INSERT … ON CONFLICT DO NOTHING (un error de clave única abortaría la transacción). Vence a los
 * `store_credit_validity_days` (90 🟡). `code` fijo solo existe para el seed de la demo (DEMO_MODE).
 */
export async function issueVoucher(
  tx: Tx,
  input: { actor: Actor; locationId: string; amount: number; returnId: string; idempotencyKey: string; code?: string },
): Promise<IssuedVoucher> {
  const data = parseInput(schema, input);
  assertAccess(input.actor, { roles: ROLES, locationId: data.locationId });
  const location = await tx.location.findFirst({ where: { id: data.locationId, active: true }, select: { id: true } });
  if (!location) throw new AppError("NOT_FOUND", "La ubicación no existe o está inactiva.", { locationId: data.locationId });

  let fixed: string | null = null;
  if (input.code !== undefined) {
    if (!isDemoMode()) throw new AppError("FORBIDDEN", "Los códigos de vale se generan solos; uno fijo solo existe en la demo.");
    fixed = normalizeVoucherCode(input.code);
    if (!fixed) throw new AppError("VALIDATION", "El código de vale no tiene el formato esperado.");
  }

  const days = await getValidityDays(tx);
  const id = randomUUID();
  let created: { code: string; expires_at: Date } | null = null;
  for (let attempt = 0; attempt < MAX_CODE_TRIES && !created; attempt++) {
    const code = fixed ?? generateVoucherCode();
    const rows = await tx.$queryRaw<{ code: string; expires_at: Date }[]>`
      INSERT INTO vouchers (id, code, issued_location_id, initial_amount, balance, expires_at, created_by, created_at, updated_at)
      VALUES (${id}, ${code}, ${data.locationId}, ${data.amount}, ${data.amount}, now() + make_interval(days => ${days}::int), ${input.actor.id}, now(), now())
      ON CONFLICT (code) DO NOTHING
      RETURNING code, expires_at`;
    if (rows[0]) created = rows[0];
    else if (fixed) throw new AppError("CONFLICT", "Ya existe un vale con ese código.");
  }
  if (!created) throw new AppError("CONFLICT", "No se pudo generar un código de vale único. Intenta de nuevo.");

  await tx.voucherMovement.create({
    data: {
      voucherId: id,
      type: "EMISION",
      amount: data.amount,
      balanceAfter: data.amount,
      refType: "RETURN",
      refId: data.returnId,
      userId: input.actor.id,
      idempotencyKey: `${data.idempotencyKey}:emision`,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: input.actor.id,
      locationId: data.locationId,
      action: "VOUCHER_ISSUE",
      entity: "voucher",
      entityId: id,
      after: { amount: data.amount, expiresAt: created.expires_at, returnId: data.returnId, codeEnd: codeTail(created.code) },
    },
  });
  return { id, code: created.code, amount: data.amount, expiresAt: created.expires_at };
}
