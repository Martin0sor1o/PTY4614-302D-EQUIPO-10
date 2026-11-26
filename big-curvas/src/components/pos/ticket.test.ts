import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SalePaymentView, SaleView } from "@/modules/sales/client";
import { Ticket } from "./ticket";

// El ticket debe mostrar TODOS los pagos. Con un vale que no alcanza, la venta tiene dos: el vale y el resto por otro medio.

const sale = (payments: SalePaymentView[]): SaleView => ({
  id: "v1",
  number: "RGA-000197",
  status: "COMPLETADA",
  createdAt: new Date("2026-11-26T03:01:00Z"),
  location: { id: "l1", name: "Tienda Rancagua", address: null },
  sellerName: "Vendedora Rancagua",
  subtotal: 27_990,
  discountTotal: 0,
  total: 27_990,
  roundingAdjustment: 0,
  lines: [{ variantId: "p1", sku: "VPL034-BLA-52", productName: "Vestido", color: "Blanco", size: "52", quantity: 1, unitPrice: 27_990, discountBps: 0, discount: 0, lineTotal: 27_990 }],
  payments,
  voided: null,
});

/** Texto visible del ticket, sin etiquetas. */
const text = (view: SaleView) => renderToStaticMarkup(createElement(Ticket, { sale: view })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const VALE: SalePaymentView = { method: "VALE", amount: 8_990, reference: null, cashReceived: null, change: null };

describe("ticket de venta", () => {
  it("vale + efectivo: muestra los dos pagos, con lo recibido y el vuelto del efectivo", () => {
    const out = text(sale([VALE, { method: "EFECTIVO", amount: 19_000, reference: null, cashReceived: 20_000, change: 1_000 }]));
    expect(out).toContain("Medio de pago Vale Cobrado $8.990");
    expect(out).toContain("Medio de pago Efectivo Cobrado $19.000 Recibido $20.000 Vuelto $1.000");
  });

  it("vale + tarjeta: muestra la referencia de la tarjeta", () => {
    const out = text(sale([VALE, { method: "DEBITO", amount: 19_000, reference: "V-7001", cashReceived: null, change: null }]));
    expect(out).toContain("Medio de pago Débito Cobrado $19.000 Voucher V-7001");
    expect(out).toContain("Medio de pago Vale");
  });

  it("un solo pago se ve como siempre", () => {
    const out = text(sale([{ method: "CREDITO", amount: 27_990, reference: null, cashReceived: null, change: null }]));
    expect(out.match(/Medio de pago/g)).toHaveLength(1);
    expect(out).toContain("Medio de pago Crédito Cobrado $27.990");
  });
});
