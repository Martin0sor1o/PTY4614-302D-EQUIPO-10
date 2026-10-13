import type { Tx } from "@/lib/db";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { createTransfer, reserve } from "@/modules/inventory";

// Dónde se aparta cada línea de un pedido (docs/03 §6.2 paso 2). Lo usan "confirmar pago" y "completar faltante".
//   · Por defecto, en BODEGA (el canal online despacha solo desde bodega, RN-04).
//   · Belén puede elegir una TIENDA para una línea solo si la bodega no tiene disponible para la línea COMPLETA
//     (una línea sale de una sola ubicación: no se divide entre bodega y tienda).
//   · Las líneas apartadas en una tienda generan un traslado tienda → bodega ligado al pedido y a sus reservas.

export interface AllocationItem {
  lineId: string;
  variantId: string;
  qty: number;
}

export interface AllocationOrder {
  id: string;
  number: string;
  fulfillmentLocationId: string;
}

export async function allocateLines(
  tx: Tx,
  input: {
    actor: Actor;
    order: AllocationOrder;
    items: AllocationItem[];
    /** lineId → tienda elegida. Las líneas que no aparecen se apartan en bodega. */
    storeSources: ReadonlyMap<string, string>;
    /** Base de las claves de idempotencia de los traslados creados. */
    keyBase: string;
    /** Guarda en la línea la ubicación de origen elegida (confirmar pago). */
    setLineSource: boolean;
  },
): Promise<{ transfers: { id: string; number: string }[] }> {
  const { actor, order, items, storeSources } = input;

  const itemIds = new Set(items.map((i) => i.lineId));
  for (const lineId of storeSources.keys()) {
    if (!itemIds.has(lineId)) throw new AppError("VALIDATION", "Se eligió una ubicación para una línea que no corresponde a este pedido.", { lineId });
  }

  const variants = await tx.productVariant.findMany({ where: { id: { in: items.map((i) => i.variantId) } }, select: { id: true, sku: true } });
  const skuOf = new Map(variants.map((v) => [v.id, v.sku]));

  // Solo se acepta una TIENDA activa con POS (nunca otra bodega ni la misma ubicación de despacho).
  const storeIds = [...new Set(storeSources.values())];
  if (storeIds.length > 0) {
    const stores = await tx.location.findMany({
      where: { id: { in: storeIds }, active: true, sellsPos: true, fulfillsOnline: false },
      select: { id: true },
    });
    if (stores.length !== storeIds.length) throw new AppError("VALIDATION", "Solo se puede apartar en una tienda activa.");
  }

  // La tienda solo se acepta si la bodega no tiene disponible para la línea completa.
  for (const item of items) {
    if (!storeSources.has(item.lineId)) continue;
    const level = await tx.stockLevel.findUnique({
      where: { variantId_locationId: { variantId: item.variantId, locationId: order.fulfillmentLocationId } },
      select: { onHand: true, reserved: true },
    });
    const available = level ? level.onHand - level.reserved : 0;
    if (available >= item.qty) {
      throw new AppError(
        "VALIDATION",
        `${skuOf.get(item.variantId) ?? item.variantId}: la bodega tiene ${available} disponible(s) para las ${item.qty} que pide el pedido. Se aparta en bodega; la tienda solo se usa si la bodega no alcanza para la línea completa.`,
        { lineId: item.lineId, available },
      );
    }
  }

  // Todo se aparta en una sola operación (variantes ordenadas por InventoryService). Si algo no alcanza, falla
  // con STOCK_INSUFICIENTE nombrando la prenda y la ubicación, y la transacción completa se revierte.
  const locationOf = (i: AllocationItem) => storeSources.get(i.lineId) ?? order.fulfillmentLocationId;
  const reservations = await reserve(tx, {
    actor,
    lines: items.map((i) => ({ variantId: i.variantId, locationId: locationOf(i), qty: i.qty, orderLineId: i.lineId })),
  });

  if (input.setLineSource) {
    for (const item of items) {
      const to = storeSources.get(item.lineId);
      if (to) await tx.onlineOrderLine.update({ where: { id: item.lineId }, data: { sourceLocationId: to } });
    }
  }

  // Un traslado tienda → bodega por cada tienda, ligado al pedido y a las líneas/reservas apartadas allí.
  const transfers: { id: string; number: string }[] = [];
  for (const storeId of storeIds) {
    const lines = items
      .map((item, index) => ({ item, reservation: reservations[index] }))
      .filter(({ item }) => storeSources.get(item.lineId) === storeId)
      .map(({ item, reservation }) => ({ variantId: item.variantId, qty: item.qty, orderLineId: item.lineId, reservationId: reservation.id }));
    const transfer = await createTransfer(tx, {
      actor,
      fromLocationId: storeId,
      toLocationId: order.fulfillmentLocationId,
      reason: "PEDIDO_ONLINE",
      onlineOrderId: order.id,
      lines,
      idempotencyKey: `${input.keyBase}:traslado:${storeId}`,
    });
    transfers.push({ id: transfer.id, number: transfer.number });
  }
  return { transfers };
}
