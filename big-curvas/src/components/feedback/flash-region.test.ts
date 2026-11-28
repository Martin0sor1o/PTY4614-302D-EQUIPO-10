import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FlashView } from "./flash-region";

// El layout se prueba con la sesión y el marco simulados: lo que importa es que la región exista desde el primer dibujo.
vi.mock("@/modules/auth", () => ({ getCurrentUser: async () => ({ id: "u1", name: "Belén" }) }));
vi.mock("@/components/layout/app-shell", () => ({ AppShell: ({ children }: { children: unknown }) => children }));

const LIVE = /<div role="status" aria-live="polite" aria-atomic="true">/;
const render = (message: Parameters<typeof FlashView>[0]["message"]) =>
  renderToStaticMarkup(createElement(FlashView, { message, onClose: () => undefined, onPause: () => undefined }));

describe("región de avisos", () => {
  it("el layout autenticado la monta aunque no haya avisos", async () => {
    const { default: AppLayout } = await import("@/app/(app)/layout");
    const html = renderToStaticMarkup(await AppLayout({ children: createElement("p", null, "pantalla") }));
    expect(html).toContain("pantalla");
    expect(html).toMatch(LIVE);
    expect(html).not.toContain("flash-message");
  });

  it("vacía: la región está, sin botón ni nada que tape clics", () => {
    const html = render(null);
    expect(html).toMatch(LIVE);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("pointer-events-auto");
  });

  it("con aviso: el texto va dentro de la región y el botón de cerrar, fuera; no se imprime", () => {
    const html = render({ id: 1, tone: "ok", text: "Venta RGA-000197 cobrada · $27.990" });
    const live = html.slice(html.search(LIVE), html.indexOf("<button"));
    // Cada tramo va en su propio bloque (para que la línea no lo parta), y el texto completo se lee igual.
    expect(live).toContain('<span class="inline-block">$27.990</span>');
    expect(live.replace(/<[^>]*>/g, "")).toContain("Venta RGA-000197 cobrada · $27.990");
    expect(html).toContain('aria-label="Cerrar aviso"');
    expect(html).toContain("print:hidden");
    expect(html).not.toContain("autofocus");
  });
});
