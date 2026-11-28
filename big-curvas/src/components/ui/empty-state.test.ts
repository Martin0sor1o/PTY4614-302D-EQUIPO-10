import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SalesTab } from "@/components/reports/sales-tab";
import type { SalesByPaymentMethod } from "@/modules/reports";
import { EmptyAction, EmptyLine } from "./empty-state";

const line = (text: string, action: ReactNode) => createElement(EmptyLine, { action } as ComponentProps<typeof EmptyLine>, text);

describe("estados vacíos con siguiente paso", () => {
  it("muestra el texto y el enlace a la acción", () => {
    const action = createElement(EmptyAction, { href: "/pos" } as ComponentProps<typeof EmptyAction>, "Ir a vender");
    const html = renderToStaticMarkup(line("Aún no hay ventas hoy.", action));
    expect(html).toContain("Aún no hay ventas hoy.");
    expect(html).toMatch(/<a [^>]*href="\/pos"[^>]*>Ir a vender<\/a>/);
  });

  it("sin acción posible, queda solo el texto", () => {
    const html = renderToStaticMarkup(line("No hay diferencias por resolver.", null));
    expect(html).not.toContain("<a ");
  });

  const empty = { count: 0, efectivo: 0, debito: 0, credito: 0, tarjeta: 0, transferencia: 0, otros: 0, total: 0, shipping: 0, averageTicket: 0 };
  const report: SalesByPaymentMethod = {
    from: "2026-01-01",
    to: "2026-01-07",
    channel: "todos",
    groupBy: "day",
    rows: [],
    totals: empty,
    voided: { count: 0, total: 0 },
    pendingRefunds: { orders: 0, amount: 0 },
  };

  it("Reportes sin ventas: ofrece volver a los últimos 30 días solo si el filtro era otro", () => {
    const filtered = renderToStaticMarkup(createElement(SalesTab, { report, resetHref: "/reportes?tab=ventas" }));
    expect(filtered).toContain("No hay ventas en este rango");
    expect(filtered).toMatch(/<a href="\/reportes\?tab=ventas"[^>]*>Ver últimos 30 días<\/a>/);

    const byDefault = renderToStaticMarkup(createElement(SalesTab, { report }));
    expect(byDefault).not.toContain("Ver últimos 30 días");
  });
});
