import { describe, expect, it } from "vitest";
import { VOUCHER_ALPHABET, VOUCHER_CODE_BITS, VOUCHER_CODE_CHARS, formatVoucherCode, generateVoucherCode, normalizeVoucherCode } from "./code";

describe("código del vale (ADR-021): credencial al portador de alta entropía", () => {
  it("tiene 12 caracteres de un alfabeto de 32 sin ambiguos (0, O, 1, I) y al menos 60 bits", () => {
    expect(VOUCHER_ALPHABET).toHaveLength(32);
    expect(new Set(VOUCHER_ALPHABET).size).toBe(32);
    for (const bad of ["0", "O", "1", "I"]) expect(VOUCHER_ALPHABET).not.toContain(bad);
    expect(VOUCHER_CODE_CHARS).toBeGreaterThanOrEqual(10);
    expect(VOUCHER_CODE_BITS).toBeGreaterThanOrEqual(60);
  });

  it("se genera con el formato VAL-XXXX-XXXX-XXXX y solo con símbolos del alfabeto", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateVoucherCode();
      expect(code).toMatch(/^VAL-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    }
  });

  it("no es secuencial ni se repite (5.000 códigos, todos distintos) y usa todo el alfabeto", () => {
    const codes = Array.from({ length: 5_000 }, generateVoucherCode);
    expect(new Set(codes).size).toBe(5_000);
    const seen = new Set(codes.join("").replace(/VAL|-/g, ""));
    expect(seen.size).toBe(32);
    // Posiciones independientes: ningún carácter domina (con 60.000 símbolos y 32 posibles se esperan ~1.875 por símbolo).
    const counts = new Map<string, number>();
    for (const ch of codes.join("").replace(/VAL|-/g, "")) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    for (const n of counts.values()) {
      expect(n).toBeGreaterThan(1_500);
      expect(n).toBeLessThan(2_300);
    }
  });

  it("al escribirlo se aceptan minúsculas, espacios y guiones de más", () => {
    const code = generateVoucherCode();
    const body = code.slice(4).replaceAll("-", "");
    expect(normalizeVoucherCode(code.toLowerCase())).toBe(code);
    expect(normalizeVoucherCode(` ${body.slice(0, 4)} ${body.slice(4, 8)}  ${body.slice(8)} `)).toBe(code);
    expect(normalizeVoucherCode(`VAL${body}`)).toBe(code);
    expect(normalizeVoucherCode(body)).toBe(code);
  });

  it("lo que no tiene la forma de un código se rechaza", () => {
    for (const bad of ["", "VAL", "VAL-1234", "VAL-ABCD-EFGH-IJK", "VAL-ABCD-EFGH-JKLMN", "hola mundo", "VAL-ABC!-EFGH-JKLM"]) {
      expect(normalizeVoucherCode(bad), bad).toBeNull();
    }
  });

  it("formatVoucherCode agrupa de a 4", () => {
    expect(formatVoucherCode("ABCDEFGHJKLM")).toBe("VAL-ABCD-EFGH-JKLM");
  });
});
