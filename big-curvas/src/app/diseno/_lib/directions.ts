// TEMPORAL (Etapa 8, Fase A): datos de las tres direcciones visuales. Se elimina al elegir una.
import type { CSSProperties } from "react";

export type DirectionId = "A" | "B" | "C";
export type Tone = "ok" | "warn" | "danger" | "info" | "neutral" | "violet";

export interface Direction {
  id: DirectionId;
  name: string;
  tagline: string;
  fonts: { display: string; body: string; displayVar: string; bodyVar: string; why: string };
  radius: string;
  shadow: string;
  icons: string;
  /** Pares [texto, fondo] de cada estado. */
  tones: Record<Tone, [string, string]>;
  colors: {
    bg: string; surface: string; ink: string; muted: string; border: string; input: string;
    primary: string; primaryFg: string; primaryHover: string; ring: string; link: string;
    soft: string; // fondo de secundario / hover suave
    menuBg: string; menuFg: string; menuActive: string; menuActiveFg: string;
    accent: string; // decorativo: nunca se usa como texto sobre fondo claro
  };
  radiusRem: string;
  stroke: number;
  /** Clases por componente: lo que cambia entre direcciones además de los colores. */
  ui: {
    h1: string; button: string; buttonSm: string; card: string; thead: string; tableWrap: string; field: string; chip: string; frame: string;
  };
}

export const DIRECTIONS: Direction[] = [
  {
    id: "A",
    name: "Rosa Editorial",
    tagline: "Revista de moda: marfil rosado, vino profundo y mucho aire. Es la evolución más directa de la identidad actual.",
    fonts: {
      display: "Cormorant Garamond",
      body: "Figtree",
      displayVar: "var(--font-a-display)",
      bodyVar: "var(--font-a-body)",
      why: "Serif de revista para títulos y marca; sans limpia y muy legible para tablas y cajas.",
    },
    radius: "Radios medios (6–8 px)",
    shadow: "Sin sombras: bordes finos de 1 px",
    icons: "Línea fina (trazo 1,25), sin contenedor",
    radiusRem: "0.375rem",
    stroke: 1.25,
    colors: {
      bg: "#FBF3F4", surface: "#FFFFFF", ink: "#2A1A20", muted: "#6B5560", border: "#E8D5DA", input: "#9A7E89",
      primary: "#8A1C4A", primaryFg: "#FFFFFF", primaryHover: "#6E1239", ring: "#B3245F", link: "#8A1C4A",
      soft: "#F6E4E8", menuBg: "#FFFFFF", menuFg: "#2A1A20", menuActive: "#8A1C4A", menuActiveFg: "#8A1C4A",
      accent: "#E7B4C3",
    },
    tones: {
      ok: ["#1F6B4A", "#E3F2EA"], warn: ["#85500A", "#FBEBCB"], danger: ["#A32020", "#FBE2E0"],
      info: ["#1E4F8A", "#E1ECF8"], neutral: ["#4A4045", "#EFE6E8"], violet: ["#5B2A86", "#EDE3F6"],
    },
    ui: {
      h1: "text-[2.1rem] font-semibold leading-none tracking-tight",
      button: "h-10 rounded-md px-4 text-sm",
      buttonSm: "h-8 rounded-md px-3 text-xs",
      card: "shadow-none ring-1 ring-foreground/15",
      thead: "text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
      tableWrap: "rounded-lg border bg-card",
      field: "h-10 rounded-md bg-card",
      chip: "rounded-sm",
      frame: "rounded-lg border",
    },
  },
  {
    id: "B",
    name: "Terracota Cálida",
    tagline: "Boutique de barrio con calidez: crema, terracota y salvia. Formas suaves y redondeadas; cercana y segura.",
    fonts: {
      display: "Fraunces",
      body: "DM Sans",
      displayVar: "var(--font-b-display)",
      bodyVar: "var(--font-b-body)",
      why: "Serif «blanda» con carácter para títulos; sans amable y redonda para el trabajo diario.",
    },
    radius: "Radios grandes (16–28 px) y botones en píldora",
    shadow: "Sombras suaves y cálidas que elevan las tarjetas",
    icons: "Trazo 2 redondeado dentro de un círculo tintado",
    radiusRem: "0.875rem",
    stroke: 2,
    colors: {
      bg: "#FBF5EE", surface: "#FFFDF9", ink: "#2B1F1A", muted: "#6A5850", border: "#E9DACB", input: "#92796A",
      primary: "#A2402B", primaryFg: "#FFFFFF", primaryHover: "#86301F", ring: "#B5472C", link: "#A2402B",
      soft: "#F3E6D6", menuBg: "#F3E6D6", menuFg: "#2B1F1A", menuActive: "#A2402B", menuActiveFg: "#FFFFFF",
      accent: "#F2B79B",
    },
    tones: {
      ok: ["#2F6B4B", "#E1EFE5"], warn: ["#85500A", "#FBE9C8"], danger: ["#A3261F", "#FADFDA"],
      info: ["#24527E", "#E0EBF4"], neutral: ["#54463F", "#EFE4D8"], violet: ["#6A3A7D", "#F0E4F3"],
    },
    ui: {
      h1: "text-3xl font-semibold leading-tight tracking-tight",
      button: "h-11 rounded-full px-5 text-sm shadow-[0_6px_14px_-6px_rgba(130,50,25,0.45)]",
      buttonSm: "h-9 rounded-full px-4 text-xs",
      card: "ring-1 ring-foreground/10 shadow-[0_10px_28px_-12px_rgba(120,70,40,0.35)]",
      thead: "text-xs font-semibold text-muted-foreground",
      tableWrap: "rounded-3xl border bg-card shadow-[0_10px_28px_-14px_rgba(120,70,40,0.3)] [&_tbody_tr:nth-child(even)]:bg-[#FBF5EE]",
      field: "h-11 rounded-2xl bg-card",
      chip: "rounded-full",
      frame: "rounded-3xl border",
    },
  },
  {
    id: "C",
    name: "Ciruela Deco",
    tagline: "Boutique de lujo discreto: ciruela, champán y líneas rectas de inspiración art déco. Moderna y segura de sí misma.",
    fonts: {
      display: "Jost",
      body: "Manrope",
      displayVar: "var(--font-c-display)",
      bodyVar: "var(--font-c-body)",
      why: "Geométrica elegante en mayúsculas espaciadas para marca y títulos; Manrope, nítida y cómoda en cifras.",
    },
    radius: "Casi rectos (2 px)",
    shadow: "Sombra nítida desplazada en champán, sin difuminar",
    icons: "Trazo 1,75 dentro de un cuadrado con borde",
    radiusRem: "0.125rem",
    stroke: 1.75,
    colors: {
      bg: "#F7F4F8", surface: "#FFFFFF", ink: "#1E1423", muted: "#5F5366", border: "#DDD3E2", input: "#867791",
      primary: "#4B1D5E", primaryFg: "#FFFFFF", primaryHover: "#36154A", ring: "#7A3A94", link: "#4B1D5E",
      soft: "#ECE4F1", menuBg: "#2A1235", menuFg: "#F1E6D0", menuActive: "#C8A96A", menuActiveFg: "#F1E6D0",
      accent: "#C8A96A",
    },
    tones: {
      ok: ["#1C6648", "#DFF1E7"], warn: ["#7D4A00", "#F9E9C5"], danger: ["#9E1F2A", "#F8DEE0"],
      info: ["#1D4E85", "#DEEAF7"], neutral: ["#473E4D", "#ECE6EF"], violet: ["#59268A", "#EBE1F7"],
    },
    ui: {
      h1: "text-2xl font-medium uppercase leading-tight tracking-[0.14em]",
      button: "h-10 rounded-[2px] px-5 text-xs font-semibold uppercase tracking-[0.12em]",
      buttonSm: "h-8 rounded-[2px] px-3 text-[11px] font-semibold uppercase tracking-[0.1em]",
      card: "ring-1 ring-foreground/25 shadow-[4px_4px_0_0_#C8A96A]",
      thead: "bg-[#2A1235] text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F1E6D0] hover:bg-[#2A1235]",
      tableWrap: "rounded-[2px] border border-foreground/25 bg-card",
      field: "h-10 rounded-[2px] bg-card",
      chip: "rounded-[2px]",
      frame: "rounded-[2px] border border-foreground/25",
    },
  },
];

/** Variables CSS que reescriben los tokens de shadcn solo dentro del panel de la dirección. */
export function directionVars(d: Direction): CSSProperties {
  const c = d.colors;
  const vars: Record<string, string> = {
    "--background": c.bg, "--foreground": c.ink, "--card": c.surface, "--card-foreground": c.ink,
    "--popover": c.surface, "--popover-foreground": c.ink, "--primary": c.primary, "--primary-foreground": c.primaryFg,
    "--secondary": c.soft, "--secondary-foreground": c.ink, "--muted": c.soft, "--muted-foreground": c.muted,
    "--accent": c.soft, "--accent-foreground": c.ink, "--destructive": d.tones.danger[0], "--border": c.border,
    "--input": c.input, "--ring": c.ring, "--radius": d.radiusRem,
    "--brand-pink": c.accent, "--brand-pink-strong": c.primaryHover, "--brand-ink": c.link, "--brand-black": c.ink,
    "--dir-display": d.fonts.displayVar, "--dir-body": d.fonts.bodyVar, "--dir-stroke": String(d.stroke),
    "--dir-accent": c.accent, "--dir-menu-bg": c.menuBg, "--dir-menu-fg": c.menuFg,
    "--dir-menu-active": c.menuActive, "--dir-menu-active-fg": c.menuActiveFg,
  };
  for (const [tone, [fg, bg]] of Object.entries(d.tones)) {
    vars[`--st-${tone}-fg`] = fg;
    vars[`--st-${tone}-bg`] = bg;
  }
  return vars as CSSProperties;
}

// ---- Contraste WCAG 2.x ----

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastRow {
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  /** 4,5 para texto normal; 3 para componentes de interfaz y foco (WCAG 1.4.11). */
  min: 4.5 | 3;
}

export function contrastRows(d: Direction): ContrastRow[] {
  const c = d.colors;
  const raw: [string, string, string, 4.5 | 3][] = [
    ["Texto sobre fondo", c.ink, c.bg, 4.5],
    ["Texto secundario sobre fondo", c.muted, c.bg, 4.5],
    ["Texto secundario sobre tarjeta", c.muted, c.surface, 4.5],
    ["Botón principal (texto)", c.primaryFg, c.primary, 4.5],
    ["Botón principal al pasar el cursor", c.primaryFg, c.primaryHover, 4.5],
    ["Enlace sobre fondo", c.link, c.bg, 4.5],
    ["Menú: texto", c.menuFg, c.menuBg, 4.5],
    ["Menú: opción activa", c.menuActive, c.menuBg, 3],
    ["Borde de campo sobre tarjeta", c.input, c.surface, 3],
    ["Anillo de foco sobre fondo", c.ring, c.bg, 3],
    ["Anillo de foco sobre tarjeta", c.ring, c.surface, 3],
  ];
  const rows = raw.map(([label, fg, bg, min]) => ({ label, fg, bg, min, ratio: contrast(fg, bg) }));
  const labels: Record<Tone, string> = {
    ok: "Estado «Pagado»", warn: "Estado «Stock bajo»", danger: "Estado «Anulado»", info: "Estado «En tránsito»", neutral: "Estado «Borrador»", violet: "Estado «Por resolver»",
  };
  for (const tone of Object.keys(d.tones) as Tone[]) {
    const [fg, bg] = d.tones[tone];
    rows.push({ label: labels[tone], fg, bg, min: 4.5, ratio: contrast(fg, bg) });
  }
  return rows;
}
