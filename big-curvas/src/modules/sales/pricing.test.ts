import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import {
  assertDiscountWithinLimit,
  cashDifference,
  changeFor,
  effectivePrice,
  expectedCash,
  priceLine,
  priceSale,
  quotePayment,
} from "./pricing";

describe("precio efectivo", () => {
  it("usa price_override si existe; si no, base_price", () => {
    expect(effectivePrice({ priceOverride: null, basePrice: 29_990 })).toBe(29_990);
    expect(effectivePrice({ priceOverride: 24_990, basePrice: 29_990 })).toBe(24_990);
  });
  it("un override de 0 es un precio válido (no cae al base)", () => {
    expect(effectivePrice({ priceOverride: 0, basePrice: 29_990 })).toBe(0);
  });
});

describe("línea y descuento en puntos básicos", () => {
  it("sin descuento", () => {
    expect(priceLine({ unitPrice: 29_990, quantity: 2, discountBps: 0 })).toMatchObject({ gross: 59_980, discount: 0, lineTotal: 59_980 });
  });
  it("10 % de 29.990 = 2.999", () => {
    expect(priceLine({ unitPrice: 29_990, quantity: 1, discountBps: 1000 })).toMatchObject({ discount: 2_999, lineTotal: 26_991 });
  });
  it("redondea el descuento half-up al peso: 12,5 % de 26.990 = 3.373,75 → 3.374", () => {
    expect(priceLine({ unitPrice: 26_990, quantity: 1, discountBps: 1250 })).toMatchObject({ discount: 3_374, lineTotal: 23_616 });
  });
  it("el descuento se calcula sobre el bruto de la línea (precio × cantidad)", () => {
    expect(priceLine({ unitPrice: 9_990, quantity: 3, discountBps: 500 })).toMatchObject({ gross: 29_970, discount: 1_499, lineTotal: 28_471 });
  });
  it("rechaza cantidad no entera o ≤ 0, y bps fuera de rango", () => {
    expect(() => priceLine({ unitPrice: 1000, quantity: 0, discountBps: 0 })).toThrow(RangeError);
    expect(() => priceLine({ unitPrice: 1000, quantity: 1.5, discountBps: 0 })).toThrow(RangeError);
    expect(() => priceLine({ unitPrice: 1000, quantity: 1, discountBps: 10_001 })).toThrow(RangeError);
    expect(() => priceLine({ unitPrice: 1000.5, quantity: 1, discountBps: 0 })).toThrow(RangeError);
  });
});

describe("venta completa", () => {
  it("suma brutos y descuentos; total = subtotal − descuentos", () => {
    const sale = priceSale([
      { unitPrice: 29_990, quantity: 1, discountBps: 1000 },
      { unitPrice: 12_990, quantity: 2, discountBps: 0 },
    ]);
    expect(sale.subtotal).toBe(55_970);
    expect(sale.discountTotal).toBe(2_999);
    expect(sale.total).toBe(52_971);
  });
});

describe("límite de descuento", () => {
  it("en el límite pasa; sobre el límite exige aprobación con el mensaje de negocio", () => {
    expect(() => assertDiscountWithinLimit(1000, 1000)).not.toThrow();
    try {
      assertDiscountWithinLimit(1001, 1000);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("APROBACION_REQUERIDA");
      expect((e as AppError).message).toMatch(/^Requiere aprobación de Belén/);
    }
  });
});

describe("redondeo de efectivo a $10 (RN-19)", () => {
  it.each([
    [26_991, 26_990, -1],
    [26_992, 26_990, -2],
    [26_993, 26_990, -3],
    [26_994, 26_990, -4],
    [26_995, 26_990, -5],
  ])("terminación 1–5 baja: %i → %i (ajuste %i)", (total, amount, adj) => {
    expect(quotePayment(total, "EFECTIVO")).toEqual({ amount, roundingAdjustment: adj });
  });
  it.each([
    [26_996, 27_000, 4],
    [26_997, 27_000, 3],
    [26_998, 27_000, 2],
    [26_999, 27_000, 1],
  ])("terminación 6–9 sube: %i → %i (ajuste +%i)", (total, amount, adj) => {
    expect(quotePayment(total, "EFECTIVO")).toEqual({ amount, roundingAdjustment: adj });
  });
  it("terminación 0 no ajusta", () => {
    expect(quotePayment(26_990, "EFECTIVO")).toEqual({ amount: 26_990, roundingAdjustment: 0 });
  });
  it("tarjeta y transferencia no se redondean", () => {
    for (const m of ["DEBITO", "CREDITO", "TRANSFERENCIA"] as const) {
      expect(quotePayment(26_997, m)).toEqual({ amount: 26_997, roundingAdjustment: 0 });
    }
  });
});

describe("vuelto", () => {
  it("recibido − cobrado", () => {
    expect(changeFor(30_000, 26_990)).toBe(3_010);
    expect(changeFor(26_990, 26_990)).toBe(0);
  });
  it("no alcanza → error", () => {
    expect(() => changeFor(26_980, 26_990)).toThrow(RangeError);
  });
});

describe("cuadratura de caja", () => {
  it("esperado = inicial + efectivo cobrado (neto de vuelto, con redondeo)", () => {
    // Ventas: 26.997 → cobra 27.000 (+3); 12.993 → cobra 12.990 (−3); 5.000 con tarjeta no entra.
    expect(expectedCash(50_000, [27_000, 12_990])).toBe(89_990);
  });
  it("sin ventas en efectivo, esperado = inicial", () => {
    expect(expectedCash(50_000, [])).toBe(50_000);
  });
  it("diferencia = contado − esperado", () => {
    expect(cashDifference(89_990, 89_990)).toBe(0);
    expect(cashDifference(89_000, 89_990)).toBe(-990);
    expect(cashDifference(90_500, 89_990)).toBe(510);
  });
});
