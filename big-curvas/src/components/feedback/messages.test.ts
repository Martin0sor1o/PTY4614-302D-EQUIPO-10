import { describe, expect, it } from "vitest";
import { approvalFlashText, returnFlashText, saleFlashText, transferReceivedFlashText, transferSentFlashText } from "./messages";

const CODE = "VAL-C7KM-4QRT-9XWZ";

const payment = (method: "EFECTIVO" | "DEBITO" | "VALE", amount: number, change: number | null = null) => ({
  method,
  amount,
  reference: null,
  cashReceived: change === null ? null : amount + change,
  change,
});

describe("aviso de cobro", () => {
  it("número, lo cobrado y el vuelto", () => {
    expect(saleFlashText({ number: "RGA-000197", status: "COMPLETADA", payments: [payment("EFECTIVO", 27_990, 2_010)] })).toBe(
      "Venta RGA-000197 cobrada · $27.990 · vuelto $2.010",
    );
  });

  it("suma los medios de pago y omite el vuelto si no hubo", () => {
    expect(saleFlashText({ number: "RGA-000198", status: "COMPLETADA", payments: [payment("VALE", 10_000), payment("DEBITO", 5_990)] })).toBe(
      "Venta RGA-000198 cobrada · $15.990",
    );
    expect(saleFlashText({ number: "RGA-000199", status: "COMPLETADA", payments: [payment("EFECTIVO", 9_000, 0)] })).toBe(
      "Venta RGA-000199 cobrada · $9.000",
    );
  });

  it("una venta anulada no se anuncia como cobrada", () => {
    expect(saleFlashText({ number: "RGA-000200", status: "ANULADA", payments: [payment("DEBITO", 5_000)] })).toBeNull();
  });
});

describe("aviso de devolución y cambio", () => {
  const voucher = (balance: number) => ({ id: "v1", code: CODE, initialAmount: 12_990, balance, expiresAt: new Date() });

  it("a vale: el código va enmascarado", () => {
    const text = returnFlashText({ type: "DEVOLUCION", number: "DEV-000012", refundMethod: "VALE", refundAmount: 0, voucher: voucher(12_990) }, null);
    expect(text).toBe("Devolución DEV-000012 registrada · Vale …9XWZ por $12.990");
    expect(text).not.toContain(CODE);
    expect(text).not.toContain("C7KM");
  });

  it("en dinero: cuánto y cómo", () => {
    expect(returnFlashText({ type: "DEVOLUCION", number: "DEV-000013", refundMethod: "EFECTIVO", refundAmount: 8_990, voucher: null }, null)).toBe(
      "Devolución DEV-000013 registrada · reembolso $8.990 en efectivo",
    );
  });

  it("cambio con diferencia: lo que pagó la clienta (sin el crédito del vale) y su vuelto", () => {
    const sale = { payments: [payment("VALE", 12_990), payment("EFECTIVO", 3_000, 2_000)] };
    expect(returnFlashText({ type: "CAMBIO", number: "DEV-000014", refundMethod: "NINGUNO", refundAmount: 0, voucher: voucher(0) }, sale)).toBe(
      "Cambio DEV-000014 registrado · la clienta pagó $3.000 · vuelto $2.000",
    );
  });

  it("cambio con saldo a favor: sin pago y con el vale enmascarado", () => {
    const text = returnFlashText(
      { type: "CAMBIO", number: "DEV-000015", refundMethod: "NINGUNO", refundAmount: 0, voucher: voucher(4_000) },
      { payments: [payment("VALE", 8_990)] },
    );
    expect(text).toBe("Cambio DEV-000015 registrado · sin pago adicional · saldo a favor $4.000 (Vale …9XWZ)");
    expect(text).not.toContain(CODE);
  });

  it("cambio sin los datos de la venta nueva: no inventa montos", () => {
    expect(returnFlashText({ type: "CAMBIO", number: "DEV-000016", refundMethod: "NINGUNO", refundAmount: 0, voucher: null }, null)).toBe(
      "Cambio DEV-000016 registrado",
    );
  });
});

describe("aviso de traslados", () => {
  const base = {
    number: "TR-000009",
    status: "EN_TRANSITO" as const,
    sentAt: new Date(),
    receivedAt: null,
    toLocation: { id: "r", name: "Tienda Rancagua" },
    lines: [
      { qtySent: 3, qtyReceived: null },
      { qtySent: 2, qtyReceived: null },
    ],
  };

  it("enviado: unidades y destino", () => {
    expect(transferSentFlashText(base)).toBe("Traslado TR-000009 enviado · 5 unidades hacia Tienda Rancagua");
  });

  it("no anuncia lo que los datos todavía no muestran", () => {
    expect(transferSentFlashText({ ...base, status: "BORRADOR", sentAt: null })).toBeNull();
    expect(transferReceivedFlashText(base)).toBeNull();
  });

  it("recibido completo y recibido con diferencias", () => {
    const received = { ...base, status: "CERRADO" as const, receivedAt: new Date() };
    expect(
      transferReceivedFlashText({ ...received, lines: [{ qtySent: 3, qtyReceived: 3 }, { qtySent: 2, qtyReceived: 2 }] }),
    ).toBe("Traslado TR-000009 recibido · 5 de 5 unidades");
    expect(
      transferReceivedFlashText({ ...received, lines: [{ qtySent: 3, qtyReceived: 3 }, { qtySent: 2, qtyReceived: 1 }] }),
    ).toBe("Traslado TR-000009 recibido con diferencias · 4 de 5 unidades");
  });
});

describe("aviso de aprobar y rechazar", () => {
  const card = { type: "DESCUENTO_SOBRE_LIMITE", amount: 2_000, requestedByName: "Camila" };

  it("sale del estado que respondió el servidor", () => {
    expect(approvalFlashText("APROBADA", card)).toEqual({ text: "Solicitud aprobada · Descuento · $2.000 · Camila", tone: "ok" });
    expect(approvalFlashText("RECHAZADA", { ...card, amount: null })).toEqual({ text: "Solicitud rechazada · Descuento · Camila", tone: "neutral" });
  });

  it("cualquier otro estado no avisa", () => {
    for (const status of ["PENDIENTE", "VENCIDA", "USADA"]) expect(approvalFlashText(status, card)).toBeNull();
  });
});
