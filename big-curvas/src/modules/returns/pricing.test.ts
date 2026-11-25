import { describe, expect, it } from "vitest";
import { approvalNeed, daysSince, isOutOfWindow, proratedAmount, quoteRefund, splitExchange, suggestRefundMethod } from "./pricing";

describe("proratedAmount (S-04: lo pagado, prorrateado en CLP enteros)", () => {
  it("una unidad de una línea de una unidad devuelve todo el total", () => {
    expect(proratedAmount(8990, 1, 0, 1)).toBe(8990);
  });

  it("la suma de las devoluciones parciales de una línea es EXACTAMENTE su total, en cualquier orden de partes", () => {
    for (const [total, qty] of [[10000, 3], [29990, 7], [1, 3], [999, 10], [26658, 3], [100_000, 13]] as const) {
      for (const parts of [[1, qty - 1], [qty - 1, 1], Array(qty).fill(1)]) {
        const split = parts as number[];
        if (split.some((p) => p <= 0)) continue;
        let already = 0;
        let sum = 0;
        for (const p of split) {
          sum += proratedAmount(total, qty, already, p);
          already += p;
        }
        expect(sum, `${total}/${qty} en ${split.join("+")}`).toBe(total);
      }
    }
  });

  it("cada parte es entera y no negativa", () => {
    let already = 0;
    for (let i = 0; i < 7; i++) {
      const a = proratedAmount(29990, 7, already, 1);
      expect(Number.isInteger(a)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(0);
      already += 1;
    }
  });

  it("un descuento del 100 % da $0 por unidad (no hay nada que devolver)", () => {
    expect(proratedAmount(0, 2, 0, 1)).toBe(0);
  });

  it("rechaza devolver más de lo vendido o cantidades inválidas", () => {
    expect(() => proratedAmount(1000, 2, 1, 2)).toThrow(RangeError);
    expect(() => proratedAmount(1000, 2, 0, 0)).toThrow(RangeError);
    expect(() => proratedAmount(1000, 0, 0, 1)).toThrow(RangeError);
    expect(() => proratedAmount(1000.5, 2, 0, 1)).toThrow();
  });
});

describe("plazo (S-01)", () => {
  it("cuenta días calendario en hora de Chile", () => {
    // 31/10 23:30 y 01/11 00:30 en Chile (UTC−3 en verano; el cambio de hora es en septiembre) caen en días distintos.
    const sale = new Date("2026-11-01T02:30:00Z"); // 31/10 23:30 Chile
    const next = new Date("2026-11-01T03:30:00Z"); // 01/11 00:30 Chile
    expect(daysSince(sale, next)).toBe(1);
    expect(daysSince(sale, sale)).toBe(0);
  });

  it("fuera de plazo es estrictamente mayor que el plazo", () => {
    expect(isOutOfWindow(30, 30)).toBe(false);
    expect(isOutOfWindow(31, 30)).toBe(true);
  });
});

describe("reembolso en efectivo (S-06): redondeo a $10 como RN-19", () => {
  it("en efectivo redondea; en otro medio no", () => {
    expect(quoteRefund(8993, "EFECTIVO")).toEqual({ amount: 8990, roundingAdjustment: -3 });
    expect(quoteRefund(8996, "EFECTIVO")).toEqual({ amount: 9000, roundingAdjustment: 4 });
    expect(quoteRefund(8990, "EFECTIVO")).toEqual({ amount: 8990, roundingAdjustment: 0 });
    expect(quoteRefund(8993, "TRANSFERENCIA")).toEqual({ amount: 8993, roundingAdjustment: 0 });
    expect(quoteRefund(8993, "ANULACION_TRANSBANK")).toEqual({ amount: 8993, roundingAdjustment: 0 });
  });

  it("el medio sugerido es el original", () => {
    expect(suggestRefundMethod(["EFECTIVO"])).toBe("EFECTIVO");
    expect(suggestRefundMethod(["DEBITO"])).toBe("ANULACION_TRANSBANK");
    expect(suggestRefundMethod(["CREDITO"])).toBe("ANULACION_TRANSBANK");
    expect(suggestRefundMethod(["TRANSFERENCIA"])).toBe("TRANSFERENCIA");
    expect(suggestRefundMethod(["VALE", "DEBITO"])).toBe("ANULACION_TRANSBANK");
  });
});

describe("cambio (S-05): vale temporal", () => {
  it("diferencia a pagar, a favor o cero", () => {
    expect(splitExchange(10000, 15000)).toEqual({ voucherUsed: 10000, toPay: 5000, leftover: 0 });
    expect(splitExchange(10000, 4000)).toEqual({ voucherUsed: 4000, toPay: 0, leftover: 6000 });
    expect(splitExchange(10000, 10000)).toEqual({ voucherUsed: 10000, toPay: 0, leftover: 0 });
  });
});

describe("¿necesita la aprobación de Belén?", () => {
  const base = { isMoneyRefund: false, outOfWindow: false, daysSinceSale: 5, windowDays: 30, voucherAmount: 10_000, voucherCap: 50_000 };

  it("dentro de regla: la vendedora lo hace sola", () => {
    expect(approvalNeed(base)).toEqual({ type: null, reasons: [] });
  });

  it("dinero → REEMBOLSO (aunque además esté fuera de plazo; los dos motivos se informan)", () => {
    const n = approvalNeed({ ...base, isMoneyRefund: true, outOfWindow: true, daysSinceSale: 45 });
    expect(n.type).toBe("REEMBOLSO");
    expect(n.reasons).toHaveLength(2);
  });

  it("fuera de plazo sin dinero → CAMBIO_FUERA_PLAZO", () => {
    expect(approvalNeed({ ...base, outOfWindow: true, daysSinceSale: 45 }).type).toBe("CAMBIO_FUERA_PLAZO");
  });

  it("vale sobre el tope → VALE_SOBRE_TOPE; justo en el tope no", () => {
    expect(approvalNeed({ ...base, voucherAmount: 50_001 }).type).toBe("VALE_SOBRE_TOPE");
    expect(approvalNeed({ ...base, voucherAmount: 50_000 }).type).toBeNull();
  });
});
