import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VoucherSummary } from "./voucher-summary";

const text = (props: { issued: number; redeemed: number; exchangeCredit: number }) =>
  renderToStaticMarkup(createElement(VoucherSummary, props)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("resumen de vales del cierre de caja", () => {
  it("con crédito por cambio: lo aclara junto a Canjeados, sin tocar las cifras", () => {
    expect(text({ issued: 26_990, redeemed: 17_980, exchangeCredit: 8_990 })).toBe(
      "Vales (no mueven efectivo) Emitidos en esta caja $26.990 Canjeados en ventas $17.980 (incluye $8.990 de crédito por cambio)",
    );
  });

  it("sin cambios no muestra nada extra", () => {
    expect(text({ issued: 8_990, redeemed: 8_990, exchangeCredit: 0 })).toBe(
      "Vales (no mueven efectivo) Emitidos en esta caja $8.990 Canjeados en ventas $8.990",
    );
  });

  it("sin vales no se dibuja el bloque", () => {
    expect(text({ issued: 0, redeemed: 0, exchangeCredit: 0 })).toBe("");
  });
});
