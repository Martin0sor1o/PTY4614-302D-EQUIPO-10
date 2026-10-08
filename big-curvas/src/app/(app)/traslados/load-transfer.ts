import { notFound } from "next/navigation";
import { z } from "zod";
import { isAppError } from "@/lib/errors";
import { getTransferDetail, type TransferDetail } from "@/modules/inventory";

/** Carga el traslado de la ruta `/traslados/[id]/…`; id inválido o inexistente → 404. */
export async function loadTransfer(params: Promise<{ id: string }>): Promise<TransferDetail> {
  const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(await params);
  if (!parsed.success) notFound();
  try {
    return await getTransferDetail(parsed.data.id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}
