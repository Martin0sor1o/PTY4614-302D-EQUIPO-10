"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toFailure, type FormFailure } from "@/lib/form-action";
import { requireAccess } from "@/modules/auth";
import { deactivateVoucher } from "@/modules/vouchers";

// Vales (ADR-021): solo Belén los desactiva. El rol ADMIN se exige en el servidor; el servicio vuelve a validarlo.

export async function deactivateVoucherAction(input: unknown): Promise<{ ok: true } | FormFailure> {
  const parsed = z.object({ voucherId: z.string().trim().min(1).max(64), reason: z.string().trim().min(3, "Escribe el motivo").max(300) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos ingresados." };
  try {
    const user = await requireAccess({ roles: ["ADMIN"] });
    await deactivateVoucher({ actor: user, voucherId: parsed.data.voucherId, reason: parsed.data.reason });
    revalidatePath("/vales");
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}
