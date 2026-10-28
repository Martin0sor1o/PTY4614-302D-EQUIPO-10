import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Contraste WCAG 2.x de los tokens de color (docs/DISENO.md). Lee los valores directamente de `globals.css`:
 * si alguien cambia un color y rompe un par, este test falla en vez de quedar el problema en silencio.
 *   texto normal: ≥ 4,5:1 · borde de campo y anillo de foco (componentes de interfaz): ≥ 3:1
 */
const css = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8");
const rootBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
const tokens = new Map<string, string>();
for (const m of rootBlock.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) tokens.set(m[1], m[2].replace(/\/\*[\s\S]*?\*\//g, "").trim());

function resolve(name: string, seen = new Set<string>()): string {
  const raw = tokens.get(name);
  if (raw === undefined) throw new Error(`Token --${name} no encontrado en :root de globals.css`);
  const ref = /^var\(--([\w-]+)\)$/.exec(raw);
  if (!ref) return raw;
  if (seen.has(name)) throw new Error(`Referencia circular en --${name}`);
  return resolve(ref[1], seen.add(name));
}

/** Luminancia relativa (0–1) de un `#rrggbb` o de un gris `oklch(L% 0 0)` (el papel de las guías). */
function luminance(value: string): number {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const grey = /^oklch\(\s*([\d.]+)%\s+0\s+0\s*\)$/.exec(value);
  if (grey) return (Number(grey[1]) / 100) ** 3; // en un gris puro, Y = L³
  throw new Error(`Formato de color no soportado en el test: ${value}`);
}

function ratio(fg: string, bg: string): number {
  const [a, b] = [luminance(resolve(fg)), luminance(resolve(bg))];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const TONES = ["ok", "warn", "danger", "info", "neutral", "violet"] as const;

/** [texto, fondo, mínimo]. */
const TEXT_PAIRS: [string, string, number][] = [
  ["foreground", "background", 4.5],
  ["card-foreground", "card", 4.5],
  ["popover-foreground", "popover", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["primary-foreground", "primary-hover", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "card", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["brand-ink", "background", 4.5],
  ["brand-ink", "card", 4.5],
  ["destructive", "card", 4.5],
  ["brand-pink", "brand-black", 4.5],
  ["brand-black", "brand-pink-strong", 4.5],
  ["sidebar-foreground", "sidebar", 4.5],
  ["sidebar-primary-foreground", "sidebar-primary", 4.5],
  ["sidebar-accent-foreground", "sidebar-accent", 4.5],
  ["tone-danger-foreground", "tone-danger", 4.5],
  ["paper-ink", "paper", 4.5],
  ["paper-muted", "paper", 4.5],
  ...TONES.map((t): [string, string, number] => [`tone-${t}`, `tone-${t}-soft`, 5.5]),
];

/** [borde o anillo, fondo contra el que debe distinguirse, mínimo]. */
const UI_PAIRS: [string, string, number][] = [
  ["input", "card", 3],
  ["input", "background", 3],
  ["ring", "background", 3],
  ["ring", "card", 3],
  ["sidebar-ring", "sidebar", 3],
];

describe("contraste de los tokens de color (WCAG AA)", () => {
  it.each(TEXT_PAIRS)("texto --%s sobre --%s ≥ %s:1 (o el mínimo indicado)", (fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it.each(UI_PAIRS)("borde o foco --%s contra --%s ≥ %s:1", (fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it("detecta un par que no cumple (el cálculo no es trivial)", () => {
    expect(ratio("brand-pink", "background")).toBeLessThan(4.5); // el rosado claro nunca va como texto sobre claro
    expect(ratio("foreground", "background")).toBeGreaterThan(15);
  });
});
