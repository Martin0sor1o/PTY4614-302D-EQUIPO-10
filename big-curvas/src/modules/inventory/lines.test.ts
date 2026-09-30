import { describe, expect, it } from "vitest";
import { compareStockKeys, groupByStockKey, normalizeLines } from "./lines";

describe("normalizeLines", () => {
  it("suma variantes repetidas y ordena por variant_id", () => {
    expect(
      normalizeLines([
        { variantId: "v-b", qty: 1 },
        { variantId: "v-a", qty: 2 },
        { variantId: "v-b", qty: 3 },
      ]),
    ).toEqual([
      { variantId: "v-a", qty: 2 },
      { variantId: "v-b", qty: 4 },
    ]);
  });

  it("dos carritos con las mismas variantes en orden inverso quedan en el mismo orden (sin deadlock)", () => {
    const a = normalizeLines([{ variantId: "v-1", qty: 1 }, { variantId: "v-2", qty: 1 }]);
    const b = normalizeLines([{ variantId: "v-2", qty: 1 }, { variantId: "v-1", qty: 1 }]);
    expect(a.map((l) => l.variantId)).toEqual(b.map((l) => l.variantId));
  });
});

describe("groupByStockKey / compareStockKeys", () => {
  it("ordena por ubicación y luego variante, sumando repetidos", () => {
    expect(
      groupByStockKey([
        { locationId: "l-2", variantId: "v-1", qty: 1 },
        { locationId: "l-1", variantId: "v-9", qty: 1 },
        { locationId: "l-1", variantId: "v-3", qty: 2 },
        { locationId: "l-1", variantId: "v-9", qty: 5 },
      ]),
    ).toEqual([
      { locationId: "l-1", variantId: "v-3", qty: 2 },
      { locationId: "l-1", variantId: "v-9", qty: 6 },
      { locationId: "l-2", variantId: "v-1", qty: 1 },
    ]);
  });

  it("no depende del locale (orden por unidades de código)", () => {
    expect(compareStockKeys({ locationId: "a", variantId: "Z" }, { locationId: "a", variantId: "a" })).toBeLessThan(0);
  });
});
