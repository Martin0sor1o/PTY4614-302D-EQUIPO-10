import { z } from "zod";
import { db } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import { codeTail } from "./internal";

const schema = z.object({
  voucherId: z.string().trim().min(1),
  reason: z.string().trim().min(3, "Escribe el motivo").max(300),
});

/**
 * Desactiva un vale (solo ADMIN; los vales nunca se borran). Un vale desactivado no se puede canjear; su saldo y su
 * historial quedan. Cambio condicional (`WHERE active`): desactivar dos veces → CONFLICT. Queda en audit_log.
 */
export async function deactivateVoucher(input: { actor: Actor; voucherId: string; reason: string }): Promise<void> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  const data = parseInput(schema, input);
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ code: string; balance: number; issued_location_id: string }[]>`
      UPDATE vouchers SET active = false, updated_at = now()
      WHERE id = ${data.voucherId} AND active
      RETURNING code, balance, issued_location_id`;
    if (!rows[0]) {
      const exists = await tx.voucher.findUnique({ where: { id: data.voucherId }, select: { id: true } });
      throw exists ? new AppError("CONFLICT", "El vale ya está desactivado.") : new AppError("NOT_FOUND", "El vale no existe.");
    }
    await tx.auditLog.create({
      data: {
        userId: input.actor.id,
        locationId: rows[0].issued_location_id,
        action: "VOUCHER_DEACTIVATE",
        entity: "voucher",
        entityId: data.voucherId,
        before: { active: true },
        after: { active: false, balance: rows[0].balance, reason: data.reason, codeEnd: codeTail(rows[0].code) },
      },
    });
  });
}
