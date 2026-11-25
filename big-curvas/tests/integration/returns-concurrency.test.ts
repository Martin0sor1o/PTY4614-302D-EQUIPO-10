import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { receive } from "@/modules/inventory";
import { findVoucherLedgerMismatches } from "@/modules/vouchers";
import { expectInvariants, newKey, resetDemo, tx, type Fixtures } from "./helpers";
import { cambio, doReturn, JMT_NEG, openCaja, PBA_XL, sellPos, VALE } from "./returns-helpers";

// Concurrencia (regla 5): UPDATE condicional atómico, bloqueos en orden canónico, una transacción por operación.

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});

/** returned_quantity de cada línea = Σ return_lines.quantity (el contador y el registro inmutable no se separan). */
async function expectReturnedCountersMatch() {
  const rows = await db.$queryRaw<{ id: string; returned_quantity: number; lines: bigint | number }[]>`
    SELECT sl.id, sl.returned_quantity, COALESCE((SELECT sum(rl.quantity) FROM return_lines rl WHERE rl.sale_line_id = sl.id), 0) AS lines
    FROM sale_lines sl
    WHERE sl.returned_quantity <> COALESCE((SELECT sum(rl.quantity) FROM return_lines rl WHERE rl.sale_line_id = sl.id), 0)`;
  expect(rows).toEqual([]);
}

describe("dos devoluciones simultáneas de la misma línea", () => {
  it("de la última unidad: gana una y la otra recibe CONFLICT; un solo vale y un solo movimiento de stock", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL }]);
    const results = await Promise.allSettled([
      doReturn(f, sale, [{ sku: PBA_XL }], VALE),
      doReturn(f, sale, [{ sku: PBA_XL }], VALE),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((lost.reason as { code: string }).code).toBe("CONFLICT");
    expect((await db.saleLine.findFirstOrThrow({ where: { saleId: sale.saleId } })).returnedQuantity).toBe(1);
    expect(await db.return.count()).toBe(1);
    expect(await db.voucher.count()).toBe(1);
    expect(await db.inventoryMovement.count({ where: { refType: "RETURN" } })).toBe(1);
    await expectReturnedCountersMatch();
    expect(await findVoucherLedgerMismatches()).toEqual([]);
    await expectInvariants();
  });

  it("vendidas 3 y dos devoluciones de 2: solo cabe una", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 3 }]);
    const results = await Promise.allSettled([
      doReturn(f, sale, [{ sku: PBA_XL, qty: 2 }], VALE),
      doReturn(f, sale, [{ sku: PBA_XL, qty: 2 }], VALE),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.saleLine.findFirstOrThrow({ where: { saleId: sale.saleId } })).returnedQuantity).toBe(2);
    await expectReturnedCountersMatch();
    await expectInvariants();
  });

  it("vendidas 4 y cinco devoluciones de 1 a la vez: exactamente cuatro tienen éxito", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 4 }]);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => doReturn(f, sale, [{ sku: PBA_XL }], VALE)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const line = await db.saleLine.findFirstOrThrow({ where: { saleId: sale.saleId } });
    expect(line.returnedQuantity).toBe(4);
    // el valor devuelto suma exactamente lo pagado, sin pesos de más
    const paid = await db.returnLine.aggregate({ where: { saleLineId: line.id }, _sum: { amount: true } });
    expect(paid._sum.amount).toBe(line.lineTotal);
    await expectReturnedCountersMatch();
    await expectInvariants();
  });

  it("el mismo doble clic (misma clave) hace una sola devolución aunque lleguen a la vez", async () => {
    await openCaja(f);
    const sale = await sellPos(f, [{ sku: PBA_XL, qty: 2 }]);
    const key = newKey("devolucion");
    const results = await Promise.allSettled([
      doReturn(f, sale, [{ sku: PBA_XL }], VALE, { key }),
      doReturn(f, sale, [{ sku: PBA_XL }], VALE, { key }),
    ]);
    // con la misma clave una de las dos puede devolver la ya hecha (replayed) o fallar al chocar; nunca se hacen dos
    expect(await db.return.count()).toBe(1);
    expect((await db.saleLine.findFirstOrThrow({ where: { saleId: sale.saleId } })).returnedQuantity).toBe(1);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    await expectReturnedCountersMatch();
  });
});

describe("dos cambios cruzados simultáneos (sin deadlock)", () => {
  it("el cambio A devuelve X y se lleva Y mientras el B devuelve Y y se lleva X: los dos terminan, varias rondas", async () => {
    await openCaja(f);
    // Stock de sobra de las dos prendas en la tienda (Belén recibe mercadería).
    const x = await f.variant(PBA_XL);
    const y = await f.variant(JMT_NEG);
    await tx((t) =>
      receive(t, {
        actor: f.actors.belen,
        locationId: f.loc.TIENDA_RANCAGUA,
        lines: [
          { variantId: x, qty: 30 },
          { variantId: y, qty: 30 },
        ],
        idempotencyKey: newKey("recepcion"),
      }),
    );

    const ROUNDS = 6;
    for (let round = 0; round < ROUNDS; round++) {
      const saleX = await sellPos(f, [{ sku: PBA_XL }]); // $8.990
      const saleY = await sellPos(f, [{ sku: JMT_NEG }]); // $29.990
      const results = await Promise.allSettled([
        // A: devuelve X (8.990) y se lleva Y (29.990): paga la diferencia
        doReturn(f, saleX, [{ sku: PBA_XL }], await cambio(f, [{ sku: JMT_NEG }], { method: "DEBITO", reference: `A-${round}` })),
        // B: devuelve Y (29.990) y se lleva X (8.990): queda saldo a favor en el vale
        doReturn(f, saleY, [{ sku: JMT_NEG }], await cambio(f, [{ sku: PBA_XL }])),
      ]);
      for (const r of results) {
        if (r.status === "rejected") {
          const message = (r.reason as Error).message;
          expect(message, `ronda ${round}`).not.toMatch(/deadlock|40P01|interbloqueo/i);
        }
        expect(r.status, `ronda ${round}: ${r.status === "rejected" ? String((r.reason as Error).message) : ""}`).toBe("fulfilled");
      }
      await expectInvariants();
    }
    expect(await db.return.count()).toBe(ROUNDS * 2);
    expect(await findVoucherLedgerMismatches()).toEqual([]);
    await expectReturnedCountersMatch();
  });

  it("muchos cambios cruzados a la vez sobre las mismas dos prendas (4 en paralelo)", async () => {
    await openCaja(f);
    const x = await f.variant(PBA_XL);
    const y = await f.variant(JMT_NEG);
    await tx((t) =>
      receive(t, { actor: f.actors.belen, locationId: f.loc.TIENDA_RANCAGUA, lines: [{ variantId: x, qty: 30 }, { variantId: y, qty: 30 }], idempotencyKey: newKey("recepcion") }),
    );
    const salesX = [await sellPos(f, [{ sku: PBA_XL }]), await sellPos(f, [{ sku: PBA_XL }])];
    const salesY = [await sellPos(f, [{ sku: JMT_NEG }]), await sellPos(f, [{ sku: JMT_NEG }])];
    const results = await Promise.allSettled([
      doReturn(f, salesX[0], [{ sku: PBA_XL }], await cambio(f, [{ sku: JMT_NEG }], { method: "DEBITO", reference: "A1" })),
      doReturn(f, salesY[0], [{ sku: JMT_NEG }], await cambio(f, [{ sku: PBA_XL }])),
      doReturn(f, salesX[1], [{ sku: PBA_XL }], await cambio(f, [{ sku: JMT_NEG }], { method: "DEBITO", reference: "A2" })),
      doReturn(f, salesY[1], [{ sku: JMT_NEG }], await cambio(f, [{ sku: PBA_XL }])),
    ]);
    for (const r of results) expect(r.status === "rejected" ? String((r.reason as Error).message) : "ok").toBe("ok");
    await expectInvariants();
    expect(await findVoucherLedgerMismatches()).toEqual([]);
  });
});
