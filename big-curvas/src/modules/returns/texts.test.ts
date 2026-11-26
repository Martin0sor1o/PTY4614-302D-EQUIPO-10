import { describe, expect, it } from "vitest";
import { daysText, paidWithText, REFUND_METHOD_PHRASE, returnDoneTitle } from "./texts";

describe("textos del flujo de cambios y devoluciones", () => {
  it("el medio de pago lleva tilde", () => {
    expect(paidWithText(["DEBITO"])).toBe("pagada con débito");
    expect(paidWithText(["VALE", "CREDITO"])).toBe("pagada con vale + crédito");
    expect(paidWithText(["EFECTIVO", "TRANSFERENCIA"])).toBe("pagada con efectivo + transferencia");
  });

  it("el título concuerda: devolución registrada, cambio registrado", () => {
    expect(returnDoneTitle("DEVOLUCION", "DEV-000004")).toBe("Devolución DEV-000004 registrada");
    expect(returnDoneTitle("CAMBIO", "DEV-000006")).toBe("Cambio DEV-000006 registrado");
  });

  it("el medio del reembolso se nombra en español, no con el código interno", () => {
    expect(REFUND_METHOD_PHRASE.ANULACION_TRANSBANK).toBe("anulación en la máquina");
  });

  it("singular y plural de los días", () => {
    expect([daysText(0), daysText(1), daysText(31)]).toEqual(["0 días", "1 día", "31 días"]);
  });
});
