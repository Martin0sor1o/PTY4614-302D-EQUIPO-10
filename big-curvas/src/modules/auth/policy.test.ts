import { describe, expect, it } from "vitest";
import { isPlausibleEmail, normalizeEmail, validatePassword, validatePin } from "./policy";

describe("validatePassword", () => {
  it("acepta una frase larga", () => {
    expect(validatePassword("una frase larga de prueba, sin uso real")).toBeNull();
  });

  it("exige 12 caracteres como mínimo y 128 como máximo", () => {
    expect(validatePassword("corta-123")).toMatch(/al menos 12/);
    expect(validatePassword("x".repeat(129))).toMatch(/128/);
    expect(validatePassword("abcdefghij12")).toBeNull();
  });

  it("no acepta espacios al inicio o al final, ni repeticiones de un solo carácter", () => {
    expect(validatePassword(" una frase larga de prueba")).toMatch(/espacios/);
    expect(validatePassword("aaaaaaaaaaaaaaaa")).toMatch(/predecible/);
  });

  it("rechaza claves comunes aunque cambien mayúsculas, acentos o símbolos", () => {
    expect(validatePassword("Contraseña-1234")).toMatch(/común/);
    expect(validatePassword("PASSWORD 1234")).toMatch(/común/);
    expect(validatePassword("123456789012")).toMatch(/común/);
  });

  it("no puede ser igual al email ni al nombre", () => {
    expect(validatePassword("belen.contreras@ejemplo.cl", { email: "belen.contreras@ejemplo.cl" })).toMatch(/email o a tu nombre/);
    expect(validatePassword("Belén Contreras Soto", { name: "belen contreras soto" })).toMatch(/email o a tu nombre/);
    expect(validatePassword("belencontreras12", { email: "belencontreras12@ejemplo.cl" })).toMatch(/email o a tu nombre/);
    // Contiene el nombre pero no es igual: se permite.
    expect(validatePassword("Belén Contreras y su gato Tom", { name: "Belén" })).toBeNull();
  });
});

describe("validatePin (6 dígitos)", () => {
  it("acepta 6 dígitos que no sean triviales", () => {
    expect(validatePin("385201")).toBeNull();
    expect(validatePin("907316")).toBeNull();
  });

  it("exige exactamente 6 dígitos", () => {
    expect(validatePin("12345")).toMatch(/exactamente 6/);
    expect(validatePin("1234567")).toMatch(/exactamente 6/);
    expect(validatePin("38520a")).toMatch(/exactamente 6/);
    expect(validatePin("")).toMatch(/exactamente 6/);
  });

  it("rechaza todos iguales y secuencias", () => {
    expect(validatePin("111111")).toMatch(/iguales/);
    expect(validatePin("123456")).toMatch(/secuencia/);
    expect(validatePin("654321")).toMatch(/secuencia/);
    expect(validatePin("345678")).toMatch(/secuencia/);
  });
});

describe("email", () => {
  it("se normaliza a minúsculas y sin espacios", () => {
    expect(normalizeEmail("  Belen@Ejemplo.CL ")).toBe("belen@ejemplo.cl");
  });

  it("forma plausible", () => {
    expect(isPlausibleEmail("belen@ejemplo.cl")).toBe(true);
    expect(isPlausibleEmail("sin-arroba")).toBe(false);
    expect(isPlausibleEmail("a b@c.cl")).toBe(false);
    expect(isPlausibleEmail(`${"a".repeat(250)}@b.cl`)).toBe(false);
  });
});
