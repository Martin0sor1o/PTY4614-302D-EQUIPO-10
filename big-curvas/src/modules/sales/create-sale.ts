import { randomUUID } from "node:crypto";
import { db, type Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { runIdempotent, type IdempotentResult } from "@/lib/idempotency";
import { formatCLP } from "@/lib/money";
import { parseInput } from "@/lib/validation";
import { SaleChannel } from "@/generated/prisma/client";
import { sell } from "@/modules/inventory";
import { nextDocumentNumber } from "@/modules/numbering";
import { getDiscountLimitBps, getPosLocation, loadSaleView, lockOpenCashSession, TX_OPTIONS } from "./internal";
import { assertDiscountWithinLimit, effectivePrice, isDiscountOverLimit, priceSale, quotePayment } from "./pricing";
import { createSaleSchema } from "./schemas";
import type { SaleView } from "./types";

export interface CreateSaleInput {
  actor: Actor;
  locationId: string;
  /** Cantidad y descuento por línea; el precio lo pone el servidor. */
  lines: { variantId: string; qty: number; discountBps: number }[];
  /** Un medio de pago por venta en la demo. El monto lo calcula el servidor. */
  payment:
    | { method: "EFECTIVO"; cashReceived: number }
    | { method: "DEBITO" | "CREDITO" | "TRANSFERENCIA"; reference: string };
  idempotencyKey: string;
}

/**
 * Venta POS (docs/03_ARQUITECTURA.md §6.1). Una sola transacción: verifica caja abierta, recalcula precios y
 * descuentos, descuenta stock con InventoryService.sell (mismo `tx`), toma el correlativo de la tienda y
 * guarda venta, líneas y pago. Cualquier falla (stock, descuento, pago) revierte todo, correlativo incluido.
 * Idempotente: repetir la misma `idempotencyKey` devuelve la venta ya creada.
 */
export async function createSale(input: CreateSaleInput): Promise<IdempotentResult<SaleView>> {
  assertAccess(input.actor, { roles: ["ADMIN", "VENDEDORA"], locationId: input.locationId });
  const data = parseInput(createSaleSchema, input);

  return runIdempotent({
    find: async () => {
      const existing = await loadSaleView(db, { idempotencyKey: data.idempotencyKey });
      if (existing && existing.location.id !== data.locationId) {
        throw new AppError("CONFLICT", "Esa clave de operación ya fue usada en otra ubicación.");
      }
      return existing;
    },
    execute: async () => {
      const saleId = await db.$transaction((tx) => executeSale(tx, input.actor, data), TX_OPTIONS);
      // Se lee con el pool, ya confirmada: dentro de la transacción Prisma resolvería las relaciones en paralelo
      // sobre una sola conexión.
      const view = await loadSaleView(db, { id: saleId });
      if (!view) throw new AppError("NOT_FOUND", "No se pudo leer la venta recién creada.");
      return view;
    },
  });
}

async function executeSale(tx: Tx, actor: Actor, data: ReturnType<typeof createSaleSchema.parse>): Promise<string> {
  const { locationId, lines, payment, idempotencyKey } = data;
  const location = await getPosLocation(tx, locationId);

  // 1. Caja abierta (bloqueada FOR SHARE: un cierre simultáneo espera a esta venta).
  const session = await lockOpenCashSession(tx, locationId, "share");
  if (!session) throw new AppError("CONFLICT", "No hay caja abierta en esta tienda. Abre la caja antes de vender.");

  // 2. Prendas y precios (del servidor).
  const variantIds = [...new Set(lines.map((l) => l.variantId))];
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds }, active: true },
    select: { id: true, sku: true, priceOverride: true, productId: true },
  });
  const products = await tx.product.findMany({
    where: { id: { in: [...new Set(variants.map((v) => v.productId))] }, active: true },
    select: { id: true, basePrice: true },
  });
  const basePriceOf = new Map(products.map((p) => [p.id, p.basePrice]));
  const variantById = new Map(variants.filter((v) => basePriceOf.has(v.productId)).map((v) => [v.id, v]));
  if (variantById.size !== variantIds.length) throw new AppError("NOT_FOUND", "Una o más prendas no existen o están inactivas.");

  // 3. Límite de descuento (settings). La VENDEDORA no puede superarlo sin aprobación (flujo en la Etapa 6);
  //    el ADMIN sí puede (02_REQUERIMIENTOS §1) y queda en audit_log (DISCOUNT_OVERRIDE, más abajo).
  const limitBps = await getDiscountLimitBps(tx);
  const isAdmin = actor.role === "ADMIN";
  if (!isAdmin) {
    for (const line of lines) assertDiscountWithinLimit(line.discountBps, limitBps, variantById.get(line.variantId)!.sku);
  }
  const overLimit = lines.filter((l) => isDiscountOverLimit(l.discountBps, limitBps));

  // 4. Montos: todo calculado aquí con las funciones puras.
  const priced = priceSale(
    lines.map((l) => {
      const v = variantById.get(l.variantId)!;
      return { unitPrice: effectivePrice({ priceOverride: v.priceOverride, basePrice: basePriceOf.get(v.productId)! }), quantity: l.qty, discountBps: l.discountBps };
    }),
  );
  if (priced.total <= 0) throw new AppError("VALIDATION", "El total de la venta debe ser mayor a $0.");
  const quote = quotePayment(priced.total, payment.method);
  if (quote.amount <= 0) throw new AppError("VALIDATION", "El monto a cobrar debe ser mayor a $0.");
  if (payment.method === "EFECTIVO" && payment.cashReceived < quote.amount) {
    throw new AppError(
      "VALIDATION",
      `El monto recibido (${formatCLP(payment.cashReceived)}) es menor al total a cobrar (${formatCLP(quote.amount)}).`,
    );
  }

  // 5. Stock: si una línea no alcanza, sell lanza STOCK_INSUFICIENTE nombrando la prenda y se revierte todo.
  const saleId = randomUUID();
  await sell(tx, {
    actor,
    locationId,
    lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
    saleId,
    idempotencyKey,
  });

  // 6. Correlativo por tienda (al final: el bloqueo del contador dura lo mínimo). Un rollback no deja huecos.
  const number = await nextDocumentNumber(tx, `SALE:${location.salePrefix}`, location.salePrefix);

  await tx.sale.create({
    data: {
      id: saleId,
      number,
      channel: SaleChannel.POS,
      locationId,
      cashSessionId: session.id,
      sellerId: actor.id,
      subtotal: priced.subtotal,
      discountTotal: priced.discountTotal,
      total: priced.total,
      roundingAdjustment: quote.roundingAdjustment,
      idempotencyKey,
    },
  });
  // createMany (una sola consulta) en vez de `create` anidado: Prisma lanza los nested creates en paralelo y una
  // transacción interactiva tiene una sola conexión.
  await tx.saleLine.createMany({
    data: lines.map((l, i) => ({
      saleId,
      variantId: l.variantId,
      quantity: l.qty,
      unitPrice: priced.lines[i].unitPrice,
      manualDiscountBps: l.discountBps,
      manualDiscount: priced.lines[i].discount,
      lineTotal: priced.lines[i].lineTotal,
    })),
  });
  await tx.payment.create({
    data: {
      saleId,
      method: payment.method,
      amount: quote.amount,
      reference: payment.method === "EFECTIVO" ? null : payment.reference,
      cashReceived: payment.method === "EFECTIVO" ? payment.cashReceived : null,
    },
  });

  if (isAdmin && overLimit.length > 0) {
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        locationId,
        action: "DISCOUNT_OVERRIDE",
        entity: "sale",
        entityId: saleId,
        after: {
          saleNumber: number,
          limitBps,
          maxDiscountBps: Math.max(...overLimit.map((l) => l.discountBps)),
          lines: overLimit.map((l) => ({ sku: variantById.get(l.variantId)!.sku, discountBps: l.discountBps })),
        },
      },
    });
  }

  return saleId;
}
