import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RETURN_ASSUMPTIONS, RETURN_REASONS, RETURN_REASON_LABEL, RETURN_WINDOW_DAYS_DEFAULT, SETTING_RETURN_WINDOW_DAYS, SETTING_VALIDITY_DAYS, SETTING_VOUCHER_SELLER_CAP, VALIDITY_DAYS_DEFAULT, VOUCHER_SELLER_CAP_DEFAULT } from "./rules";
import { SETTING_VALIDITY_DAYS as VOUCHERS_SETTING, VALIDITY_DAYS_DEFAULT as VOUCHERS_DEFAULT } from "@/modules/vouchers";

// Los supuestos 🟡 viven en UN solo lugar (rules.ts) y cada uno es una pregunta para Belén listada en docs/07.

const docs07 = readFileSync("docs/07_DECISIONES_Y_PREGUNTAS.md", "utf8");

describe("registro de supuestos 🟡 (ADR-021)", () => {
  it("cada supuesto tiene un id único S-NN y al menos una pregunta", () => {
    const ids = RETURN_ASSUMPTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(Array.from({ length: 12 }, (_, i) => `S-${String(i + 1).padStart(2, "0")}`));
    for (const a of RETURN_ASSUMPTIONS) {
      expect(a.questions.length, a.id).toBeGreaterThan(0);
      expect(a.applied.length, a.id).toBeGreaterThan(10);
    }
  });

  it("todos los supuestos y sus preguntas están en docs/07 (ADR-021 y preguntas abiertas)", () => {
    for (const a of RETURN_ASSUMPTIONS) {
      expect(docs07, `falta ${a.id} en docs/07`).toContain(`| ${a.id} |`);
      for (const q of a.questions) expect(docs07, `falta la pregunta ${q} en docs/07`).toContain(`| ${q} |`);
    }
  });

  it("las claves de settings de los supuestos están documentadas", () => {
    for (const key of [SETTING_RETURN_WINDOW_DAYS, SETTING_VALIDITY_DAYS, SETTING_VOUCHER_SELLER_CAP]) expect(docs07).toContain(key);
  });

  it("valores por omisión aprobados: 30 días, 90 días y tope de $50.000", () => {
    expect(RETURN_WINDOW_DAYS_DEFAULT).toBe(30);
    expect(VALIDITY_DAYS_DEFAULT).toBe(90);
    expect(VOUCHER_SELLER_CAP_DEFAULT).toBe(50_000);
  });

  it("la vigencia del vale es la misma en returns (para mostrar) y en vouchers (para emitir)", () => {
    expect(VOUCHERS_SETTING).toBe(SETTING_VALIDITY_DAYS);
    expect(VOUCHERS_DEFAULT).toBe(VALIDITY_DAYS_DEFAULT);
  });

  it("los motivos tienen etiqueta y coinciden con el enum de la base", () => {
    expect([...RETURN_REASONS]).toEqual(["TALLA", "FALLA", "NO_ES_LO_ESPERADO", "ARREPENTIMIENTO", "OTRO"]);
    for (const r of RETURN_REASONS) expect(RETURN_REASON_LABEL[r]).toBeTruthy();
  });
});
