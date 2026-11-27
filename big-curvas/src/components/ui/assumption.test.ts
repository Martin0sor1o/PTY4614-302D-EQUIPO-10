import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RETURN_ASSUMPTIONS } from "@/modules/returns/client";
import { Assumption } from "./assumption";

// La marca que se ve en pantalla junto a cada regla de devoluciones: desde la reunión del 26/11/2026 dice que está validada.

const markup = (id: string) => renderToStaticMarkup(createElement(Assumption, { id }));
/** Lo que se ve (sin el texto para lectores de pantalla). */
const visible = (html: string) => html.replace(/<span class="sr-only">.*?<\/span>/g, "").replace(/<[^>]+>/g, "");
const helpText = (html: string) => /title="([^"]*)"/.exec(html)?.[1] ?? "";

describe("marca de las reglas de devoluciones (ADR-021)", () => {
  it("las 12 reglas dicen a la vista que Belén las validó, sin 🟡 ni «supuesto»", () => {
    for (const { id } of RETURN_ASSUMPTIONS) {
      const html = markup(id);
      expect(visible(html), id).toBe(`✅ ${id} · validado con Belén el 26/11/2026`);
      expect(html, id).not.toContain("🟡");
      expect(html.toLowerCase(), id).not.toContain("supuesto");
      expect(helpText(html), id).toContain("Regla validada con Belén el 26/11/2026.");
    }
  });

  it("solo S-01, S-02 y S-10 avisan en la ayuda que sigue abierto el pedido online ya entregado (Q-01)", () => {
    const withNote = RETURN_ASSUMPTIONS.map((a) => a.id).filter((id) => helpText(markup(id)).includes("pedidos online ya entregados sigue abierta (Q-01)"));
    expect(withNote).toEqual(["S-01", "S-02", "S-10"]);
  });

  it("un id que no existe no muestra nada", () => {
    expect(markup("S-99")).toBe("");
  });
});
