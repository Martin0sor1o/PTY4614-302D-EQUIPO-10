import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { db, type Tx } from "@/lib/db";
import type { Actor } from "@/lib/access";
import { AppError, type AppErrorCode } from "@/lib/errors";
import { resetAndSeedDemoData } from "@/modules/demo";
import { findLedgerMismatches, findReservationMismatches } from "@/modules/inventory";

// Utilidades de los tests de integración (Postgres real: BD big_curvas_test).
// Los tests usan Prisma directo SOLO para preparar datos ajenos a inventory y para verificar resultados.

export type LocationCode = "TIENDA_RANCAGUA" | "BODEGA";

export interface Fixtures {
  loc: Record<LocationCode, string>;
  /**
   * `bodega` es un usuario con rol BODEGA creado solo para los tests: el seed de la demo no lo trae
   * (Belén opera la bodega con su rol ADMIN), pero el rol sigue existiendo en el código.
   */
  actors: { belen: Actor; vendRga: Actor; vendRga2: Actor; bodega: Actor };
  variant: (sku: string) => Promise<string>;
}

/** Reinicia la BD de tests con el seed de la demo y devuelve ids útiles. */
export async function resetDemo(): Promise<Fixtures> {
  await resetAndSeedDemoData();
  const locations = await db.location.findMany();
  const loc = Object.fromEntries(locations.map((l) => [l.code, l.id])) as Record<LocationCode, string>;
  await db.user.create({ data: { name: "Bodega (test)", email: "bodega@bigcurvas.test", role: "BODEGA", locationId: loc.BODEGA } });
  const users = await db.user.findMany({ include: { location: true } });
  const actor = (email: string): Actor => {
    const u = users.find((x) => x.email === email)!;
    return {
      id: u.id,
      role: u.role,
      location: u.location ? { id: u.location.id, code: u.location.code, name: u.location.name, type: u.location.type } : null,
    };
  };
  return {
    loc,
    actors: {
      belen: actor("belen@bigcurvas.demo"),
      vendRga: actor("rancagua@bigcurvas.demo"),
      vendRga2: actor("rancagua2@bigcurvas.demo"),
      bodega: actor("bodega@bigcurvas.test"),
    },
    variant: async (sku) => (await db.productVariant.findUniqueOrThrow({ where: { sku } })).id,
  };
}

/**
 * Crea una tienda adicional (el modelo es multi-ubicación). No se borra: la BD de test se reinicia en cada
 * `resetDemo()` (TRUNCATE), igual que el resto de los datos.
 */
export async function createExtraStore(code = "TIENDA_EXTRA"): Promise<{ id: string; code: string }> {
  const l = await db.location.create({
    data: { code, name: "Tienda Extra", type: "STORE", sellsPos: true, fulfillsOnline: false, salePrefix: "EXT" },
  });
  return { id: l.id, code: l.code };
}

export const newKey = (label = "op") => `test-${label}-${randomUUID()}`;

export async function stockOf(variantId: string, locationId: string): Promise<{ onHand: number; reserved: number }> {
  const s = await db.stockLevel.findUnique({ where: { variantId_locationId: { variantId, locationId } } });
  return { onHand: s?.onHand ?? 0, reserved: s?.reserved ?? 0 };
}

export function countMovements(where: { variantId?: string; locationId?: string; type?: string; keyPrefix?: string }) {
  return db.inventoryMovement.count({
    where: {
      variantId: where.variantId,
      locationId: where.locationId,
      ...(where.type ? { type: where.type as never } : {}),
      ...(where.keyPrefix ? { idempotencyKey: { startsWith: where.keyPrefix } } : {}),
    },
  });
}

/** Ejecuta fn dentro de una transacción, como lo hará sales/orders. */
export function tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(fn);
}

export async function expectAppError(promise: Promise<unknown>, code: AppErrorCode, message?: RegExp): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `se esperaba AppError ${code}`).toBeInstanceOf(AppError);
  const appError = error as AppError;
  expect(appError.code).toBe(code);
  if (message) expect(appError.message).toMatch(message);
  return appError;
}

/** Invariantes globales: ledger = on_hand y reservas activas = reserved, en todas las filas. */
export async function expectInvariants(): Promise<void> {
  expect(await findLedgerMismatches()).toEqual([]);
  expect(await findReservationMismatches()).toEqual([]);
}

/** Pedido online mínimo para ligar reservas/traspasos (el módulo orders llega en la Etapa 5a). */
export async function createOrderLineFixture(f: Fixtures, variantId: string, sourceLocationId: string, quantity = 1) {
  const customer = await db.customer.create({ data: { name: "Clienta de prueba" } });
  const order = await db.onlineOrder.create({
    data: {
      number: `PED-T-${randomUUID().slice(0, 8)}`,
      customerId: customer.id,
      fulfillmentLocationId: f.loc.BODEGA,
      deliveryMethod: "DESPACHO",
      subtotal: 29990 * quantity,
      total: 29990 * quantity,
      createdBy: f.actors.belen.id,
      idempotencyKey: newKey("order"),
      lines: {
        create: [{ variantId, quantity, unitPrice: 29990, lineTotal: 29990 * quantity, sourceLocationId }],
      },
    },
    include: { lines: true },
  });
  return { orderId: order.id, orderLineId: order.lines[0].id };
}
