import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RETURN_ASSUMPTIONS, RETURN_REASONS, RETURN_REASON_LABEL, RETURN_WINDOW_DAYS_DEFAULT, SETTING_RETURN_WINDOW_DAYS, SETTING_VALIDITY_DAYS, SETTING_VOUCHER_SELLER_CAP, VALIDITY_DAYS_DEFAULT, VOUCHER_SELLER_CAP_DEFAULT } from "./rules";
import { SETTING_VALIDITY_DAYS as VOUCHERS_SETTING, VALIDITY_DAYS_DEFAULT as VOUCHERS_DEFAULT } from "@/modules/vouchers";

// Las reglas de ADR-021 viven en UN solo lugar (rules.ts); cada una fue una pregunta para Belén listada en docs/07 y su
// estado (validada o abierta) tiene que decir lo mismo en el código y en los documentos.

const docs07 = readFileSync("docs/07_DECISIONES_Y_PREGUNTAS.md", "utf8");

describe("registro de reglas de ADR-021", () => {
  it("cada regla tiene un id único S-NN y al menos una pregunta", () => {
    const ids = RETURN_ASSUMPTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(Array.from({ length: 12 }, (_, i) => `S-${String(i + 1).padStart(2, "0")}`));
    for (const a of RETURN_ASSUMPTIONS) {
      expect(a.questions.length, a.id).toBeGreaterThan(0);
      expect(a.applied.length, a.id).toBeGreaterThan(10);
    }
  });

  it("todas las reglas y sus preguntas están en docs/07 (ADR-021 y preguntas)", () => {
    for (const a of RETURN_ASSUMPTIONS) {
      expect(docs07, `falta ${a.id} en docs/07`).toContain(`| ${a.id} |`);
      for (const q of a.questions) expect(docs07, `falta la pregunta ${q} en docs/07`).toContain(`| ${q} |`);
    }
  });

  it("S-01 a S-12 están validadas con Belén el 26/11/2026; en S-01, S-02 y S-10 sigue abierto el pedido online ya entregado", () => {
    expect(RETURN_ASSUMPTIONS.map((a) => a.validatedOn)).toEqual(Array(12).fill("26/11/2026"));
    expect(RETURN_ASSUMPTIONS.filter((a) => a.openForDeliveredOnline).map((a) => a.id)).toEqual(["S-01", "S-02", "S-10"]);
  });

  it("docs/07 marca cada regla como validada y avisa de Q-01 en las mismas reglas que el código", () => {
    for (const a of RETURN_ASSUMPTIONS) {
      const row = docs07.split("\n").find((l) => l.trim().startsWith(`| ${a.id} |`)) ?? "";
      expect(row, a.id).toContain("validado con Belén el 26/11/2026");
      expect(row.includes("sigue abierta (Q-01)"), `Q-01 en ${a.id}`).toBe(a.openForDeliveredOnline === true);
    }
  });

  it("docs/07: P-09, P-16, P-17 y P-22 quedan respondidas; Q-01, P-11 y P-24 siguen abiertas", () => {
    const section = (from: string, to: string) => docs07.slice(docs07.indexOf(from), docs07.indexOf(to));
    const open = section("## 2. Preguntas abiertas", "## 3. Preguntas respondidas");
    const answered = section("## 3. Preguntas respondidas", "## 4. Historial");
    for (const q of ["Q-01", "P-11", "P-24"]) {
      expect(open, `${q} debe seguir abierta`).toContain(`| ${q} |`);
      expect(answered, `${q} no está respondida`).not.toContain(`| ${q} |`);
    }
    for (const q of ["P-09", "P-16", "P-17", "P-22"]) {
      expect(open, `${q} ya está cerrada`).not.toContain(`| ${q} |`);
      const row = answered.split("\n").find((l) => l.startsWith(`| ${q} |`)) ?? "";
      expect(row, q).toContain("reunión 26/11/2026");
    }
  });

  it("las claves de settings de las reglas están documentadas", () => {
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
