import { describe, expect, it } from "vitest";
import {
  assertClp,
  bpsToPercent,
  discountFromBps,
  formatCLP,
  parseCLP,
  percentToBps,
  roundCash,
  sumClp,
} from "./money";

describe("formatCLP", () => {
  it("formatea con separador de miles chileno", () => {
    expect(formatCLP(12990)).toBe("$12.990");
    expect(formatCLP(0)).toBe("$0");
    expect(formatCLP(999)).toBe("$999");
    expect(formatCLP(1_250_000)).toBe("$1.250.000");
  });
  it("formatea negativos", () => {
    expect(formatCLP(-500)).toBe("-$500");
  });
  it("rechaza no enteros", () => {
    expect(() => formatCLP(10.5)).toThrow(RangeError);
    expect(() => formatCLP(Number.NaN)).toThrow(RangeError);
  });
});

describe("parseCLP", () => {
  it("interpreta distintos formatos", () => {
    expect(parseCLP("$12.990")).toBe(12990);
    expect(parseCLP("12990")).toBe(12990);
    expect(parseCLP(" 12.990 ")).toBe(12990);
  });
  it("devuelve null si no es entero", () => {
    expect(parseCLP("abc")).toBeNull();
    expect(parseCLP("")).toBeNull();
    expect(parseCLP("12,5")).toBeNull();
  });
});

describe("assertClp / sumClp", () => {
  it("acepta enteros y rechaza decimales", () => {
    expect(assertClp(100)).toBe(100);
    expect(() => assertClp(0.1 + 0.2)).toThrow();
  });
  it("suma enteros", () => {
    expect(sumClp([10000, 2990, 500])).toBe(13490);
    expect(sumClp([])).toBe(0);
  });
});

describe("discountFromBps", () => {
  it("calcula descuentos con enteros", () => {
    expect(discountFromBps(19990, 1000)).toBe(1999); // 10 %
    expect(discountFromBps(10000, 0)).toBe(0);
    expect(discountFromBps(10000, 10000)).toBe(10000);
  });
  it("redondea half-up al peso", () => {
    expect(discountFromBps(15, 1000)).toBe(2); // 1,5 → 2
    expect(discountFromBps(14, 1000)).toBe(1); // 1,4 → 1
  });
  it("valida el rango de bps", () => {
    expect(() => discountFromBps(1000, -1)).toThrow(RangeError);
    expect(() => discountFromBps(1000, 10001)).toThrow(RangeError);
    expect(() => discountFromBps(1000, 10.5)).toThrow(RangeError);
  });
  it("convierte porcentaje ↔ bps", () => {
    expect(percentToBps(10)).toBe(1000);
    expect(percentToBps(12.5)).toBe(1250);
    expect(bpsToPercent(1000)).toBe(10);
  });
});

describe("roundCash (Ley 20.956)", () => {
  it.each([
    [10000, 10000, 0],
    [10001, 10000, -1],
    [10004, 10000, -4],
    [10005, 10000, -5],
    [10006, 10010, 4],
    [10009, 10010, 1],
  ])("%i → %i (ajuste %i)", (amount, rounded, adjustment) => {
    expect(roundCash(amount)).toEqual({ rounded, adjustment });
  });
  it("el ajuste siempre cuadra: rounded = amount + adjustment y es múltiplo de 10", () => {
    for (let a = 0; a < 200; a++) {
      const r = roundCash(a);
      expect(r.rounded).toBe(a + r.adjustment);
      expect(r.rounded % 10).toBe(0);
    }
  });
});
