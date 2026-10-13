import { notFound } from "next/navigation";
import { z } from "zod";
import { isAppError } from "@/lib/errors";
import type { Actor } from "@/lib/access";
import { getOrderDetail, type OrderDetail } from "@/modules/orders";

/** Carga el pedido de la ruta `/pedidos/[id]/…`; id inválido o inexistente → 404. */
export async function loadOrder(params: Promise<{ id: string }>, actor: Actor, forPicking = false): Promise<OrderDetail> {
  const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(await params);
  if (!parsed.success) notFound();
  try {
    return await getOrderDetail({ actor, orderId: parsed.data.id, forPicking });
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}
