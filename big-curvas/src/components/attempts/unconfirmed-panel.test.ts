import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { maskVoucherCode, NOT_FOUND_MESSAGE, OTHER_USER_MESSAGE, type AttemptSummary } from "@/lib/pending-attempt";
import { UnconfirmedPanel, VOUCHER_REMOVED_MESSAGE, type UnconfirmedPanelProps } from "./unconfirmed-panel";

// Prueba de interfaz sin navegador: se dibuja el aviso y se revisa qué dice y qué botones quedan activos. Lo que pasa al
// pulsarlos está probado en lib/pending-attempt.test.ts; los clics reales, en el ensayo local.

const VOUCHER = "VAL-C7KM-4QRT-9XWZ";
const SUMMARY: AttemptSummary = {
  operation: "venta",
  amountLabel: "Total a cobrar",
  amount: 8_990,
  lines: ["Polera básica · Negro · talla XL × 1"],
  payment: "Efectivo · recibido $10.000",
};

const render = (props: Partial<UnconfirmedPanelProps> = {}) =>
  renderToStaticMarkup(
    createElement(UnconfirmedPanel, {
      summary: SUMMARY,
      sentAt: "2026-11-27T15:30:00.000Z",
      busy: null,
      message: null,
      sameUser: true,
      voucherRemoved: false,
      onRetry: () => undefined,
      onVerify: () => undefined,
      ...props,
    }),
  );

/** El HTML del botón con ese data-testid (de la etiqueta de apertura a la de cierre). */
const button = (html: string, testId: string) => {
  const found = html.match(new RegExp(`<button(?:(?!</button>).)*?data-testid="${testId}"(?:(?!</button>).)*</button>`));
  expect(found, `no está el botón ${testId}`).not.toBeNull();
  return found![0];
};
const isDisabled = (html: string) => /\sdisabled=""/.test(html);

describe("aviso “No pudimos confirmar”", () => {
  it("dice qué pasó, qué se envió y ofrece Reintentar y Verificar", () => {
    const html = render();
    expect(html).toContain("No pudimos confirmar el cobro");
    expect(html).toContain("Polera básica · Negro · talla XL × 1");
    expect(html).toContain("$8.990");
    expect(button(html, "retry-attempt")).toContain("Reintentar");
    expect(button(html, "verify-attempt")).toContain("Verificar si la venta ya se registró");
    expect(isDisabled(button(html, "retry-attempt"))).toBe(false);
    expect(isDisabled(button(html, "verify-attempt"))).toBe(false);
  });

  it("no permite cambiar nada: solo hay esos dos botones, sin campos ni “Corregir”", () => {
    const html = render({ message: NOT_FOUND_MESSAGE });
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).not.toMatch(/<(input|select|textarea)/);
    expect(html).not.toMatch(/Corregir|Cancelar|Descartar/);
    expect(html).toContain("cierra la pestaña");
    expect(html).toContain('href="/pos/ventas"');
    expect(html).toContain("Todavía no aparece registrada");
  });

  it("devolución y cambio tienen su propio texto", () => {
    expect(render({ summary: { ...SUMMARY, operation: "devolucion" } })).toContain("No pudimos confirmar la devolución");
    const html = render({ summary: { ...SUMMARY, operation: "cambio" } });
    expect(html).toContain("No pudimos confirmar el cambio");
    expect(html).toContain("Verificar si el cambio ya se registró");
    expect(html).toContain("figuran como devueltas");
  });

  it.each(["reintentando", "verificando"] as const)("mientras está %s, los dos botones quedan desactivados", (busy) => {
    const html = render({ busy });
    expect(isDisabled(button(html, "retry-attempt"))).toBe(true);
    expect(isDisabled(button(html, "verify-attempt"))).toBe(true);
  });

  it("otra persona solo puede verificar", () => {
    const html = render({ sameUser: false });
    expect(html).toContain(OTHER_USER_MESSAGE);
    expect(isDisabled(button(html, "retry-attempt"))).toBe(true);
    expect(isDisabled(button(html, "verify-attempt"))).toBe(false);
  });

  it("si al cerrar sesión se borró el vale, solo se puede verificar", () => {
    const html = render({ voucherRemoved: true });
    expect(html).toContain(VOUCHER_REMOVED_MESSAGE);
    expect(isDisabled(button(html, "retry-attempt"))).toBe(true);
    expect(isDisabled(button(html, "verify-attempt"))).toBe(false);
  });

  it("el vale se muestra enmascarado", () => {
    const html = render({ summary: { ...SUMMARY, voucher: `${maskVoucherCode(VOUCHER)} · cubre $5.000` } });
    expect(html).toContain("Vale …9XWZ");
    expect(html).not.toContain("C7KM");
    expect(html).not.toContain("4QRT");
  });
});
