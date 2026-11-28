import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PendingButton } from "./pending-button";

const render = (props: Partial<ComponentProps<typeof PendingButton>> = {}) =>
  renderToStaticMarkup(createElement(PendingButton, { pending: false, pendingLabel: "Cobrando…", ...props }, "Confirmar venta"));
const isDisabled = (html: string) => /\sdisabled=""/.test(html);

describe("botón con estado de progreso", () => {
  it("en reposo: su texto, activo y sin spinner", () => {
    const html = render();
    expect(html).toContain("Confirmar venta");
    expect(html).not.toContain("Cobrando…");
    expect(html).not.toContain("animate-spin");
    expect(html).not.toContain('aria-busy="'); // el atributo; la clase "aria-busy:…" siempre está
    expect(isDisabled(html)).toBe(false);
  });

  it("en curso: spinner, texto en curso, deshabilitado y aria-busy", () => {
    const html = render({ pending: true });
    expect(html).toContain("Cobrando…");
    expect(html).not.toContain("Confirmar venta");
    expect(html).toContain("animate-spin");
    expect(html).toContain('aria-busy="true"');
    expect(isDisabled(html)).toBe(true);
  });

  it("respeta el deshabilitado propio de la pantalla, y estar en curso nunca lo habilita", () => {
    expect(isDisabled(render({ disabled: true }))).toBe(true);
    expect(isDisabled(render({ disabled: false, pending: true }))).toBe(true);
  });
});
