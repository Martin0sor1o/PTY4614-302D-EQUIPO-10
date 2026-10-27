// TEMPORAL (Etapa 8, Fases A y A2): datos de las direcciones visuales. Se elimina al elegir una.
import type { CSSProperties } from "react";

export type DirectionId = "A" | "B" | "C" | "D" | "E" | "F";
export type Tone = "ok" | "warn" | "danger" | "info" | "neutral" | "violet";

export interface Direction {
  id: DirectionId;
  name: string;
  tagline: string;
  /** "top": barra superior; "rail": riel lateral colapsable. */
  layout: "top" | "rail";
  density: "cómoda" | "compacta";
  /** En el riel: si en el fragmento de Stock parte colapsado (solo íconos). El POS siempre parte colapsado. */
  railStartsCollapsed: boolean;
  /** Menú de celular: la lista va sobre el color del menú o sobre una tarjeta clara. */
  mobileDrawer: "card" | "menu";
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
    menuBg: string; menuFg: string; menuActive: string; menuActiveFg: string; menuRing: string;
    wordmark: string; // color de la marca sobre el menú
    badgeBg: string; badgeFg: string; badgeActiveBg: string; badgeActiveFg: string;
    accent: string; // decorativo: nunca se usa como texto sobre fondo claro
  };
  radiusRem: string;
  stroke: number;
  /** Clases por componente: lo que cambia entre direcciones además de los colores. */
  ui: {
    h1: string; button: string; buttonSm: string; card: string; thead: string; tableWrap: string; field: string; chip: string; frame: string;
    badge: string; iconCircle: string; hlHead: string; hlCell: string; cell: string;
  };
}

const TONES: Direction["tones"] = {
  ok: ["#1F6B4A", "#E3F2EA"], warn: ["#85500A", "#FBEBCB"], danger: ["#A32020", "#FBE2E0"],
  info: ["#1E4F8A", "#E1ECF8"], neutral: ["#4A4045", "#EFE6E8"], violet: ["#5B2A86", "#EDE3F6"],
};

/** Paleta actual del sistema (negro, rosado #FFF5F8, vino #9D1F52): base de D, E y F. */
const CURRENT = { bg: "#FFF5F8", surface: "#FFFFFF", ink: "#0A0A0A", muted: "#5C5359", border: "#EAD3DC", input: "#8C6F7C", soft: "#FCE7EF", accent: "#F5C6D6", link: "#9D1F52" };

/** Dirección elegida (Etapa 8): D «Medianoche Rosa». Las demás se descartaron y siguen en el historial de git. */
export const DIRECTIONS: Direction[] = [
  {
    id: "D",
    name: "Medianoche Rosa",
    tagline: "Riel negro con acentos rosados y el vino reservado para la acción principal. La más fiel al negro, rosa y vino de hoy, con las formas de la B.",
    layout: "rail",
    density: "cómoda",
    railStartsCollapsed: false,
    mobileDrawer: "menu",
    fonts: {
      display: "Playfair Display",
      body: "Nunito Sans",
      displayVar: "var(--font-playfair)",
      bodyVar: "var(--font-nunito)",
      why: "Serif de alto contraste, la más dramática, para títulos y marca; Nunito Sans, redonda y muy legible para el trabajo.",
    },
    radius: "Radios grandes (16–28 px) y botones en píldora",
    shadow: "Sombras suaves teñidas de vino",
    icons: "Trazo 2 en un círculo negro con ícono rosado",
    radiusRem: "0.875rem",
    stroke: 2,
    colors: {
      ...CURRENT,
      primary: "#9D1F52", primaryFg: "#FFFFFF", primaryHover: "#7E1742", ring: "#9D1F52",
      menuBg: "#0A0A0A", menuFg: "#F5C6D6", menuActive: "#F5C6D6", menuActiveFg: "#0A0A0A", menuRing: "#F5C6D6",
      wordmark: "#F5C6D6", badgeBg: "#E0507F", badgeFg: "#0A0A0A", badgeActiveBg: "#0A0A0A", badgeActiveFg: "#F5C6D6",
    },
    tones: TONES,
    ui: {
      h1: "text-3xl font-bold leading-tight tracking-tight",
      button: "h-11 rounded-full px-5 text-sm font-semibold shadow-[0_6px_14px_-6px_rgba(157,31,82,0.5)]",
      buttonSm: "h-9 rounded-full px-4 text-xs font-semibold",
      card: "ring-1 ring-foreground/10 shadow-[0_10px_28px_-12px_rgba(157,31,82,0.35)]",
      thead: "text-xs font-bold uppercase tracking-wider text-muted-foreground",
      tableWrap: "rounded-3xl border bg-card shadow-[0_10px_28px_-14px_rgba(157,31,82,0.3)] [&_tbody_tr:nth-child(even)]:bg-[#FFF5F8]",
      field: "h-11 rounded-2xl bg-card",
      chip: "rounded-full",
      frame: "rounded-3xl border",
      badge: "rounded-full",
      iconCircle: "rounded-full bg-[#0A0A0A] text-[#F5C6D6]",
      hlHead: "bg-primary/10",
      hlCell: "bg-primary/5",
      cell: "py-2",
    },
  },
];

export const directionById = (id: string): Direction | undefined => DIRECTIONS.find((d) => d.id === id);

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
    "--dir-menu-active": c.menuActive, "--dir-menu-active-fg": c.menuActiveFg, "--dir-menu-ring": c.menuRing,
    "--dir-wordmark": c.wordmark, "--dir-badge-bg": c.badgeBg, "--dir-badge-fg": c.badgeFg,
    "--dir-badge-active-bg": c.badgeActiveBg, "--dir-badge-active-fg": c.badgeActiveFg,
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
    ...(d.layout === "rail"
      ? ([
          ["Menú: texto de la opción activa", c.menuActiveFg, c.menuActive, 4.5],
          ["Menú: píldora activa sobre el menú", c.menuActive, c.menuBg, 3],
        ] as [string, string, string, 4.5 | 3][])
      : ([["Menú: opción activa", c.menuActive, c.menuBg, 3]] as [string, string, string, 4.5 | 3][])),
    ["Menú: marca", c.wordmark, c.menuBg, 4.5],
    ["Menú: contador (texto)", c.badgeFg, c.badgeBg, 4.5],
    ...(d.layout === "rail" ? ([["Menú: contador en opción activa", c.badgeActiveFg, c.badgeActiveBg, 4.5]] as [string, string, string, 4.5 | 3][]) : []),
    ["Foco dentro del menú", c.menuRing, c.menuBg, 3],
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

// ---- Ancho útil del riel en pantallas críticas ----

/** Anchos del riel (px): expandido (w-48 en la maqueta; en producción 224 px sería peor) y colapsado (solo íconos). */
export const RAIL_EXPANDED_PX = 192;
export const RAIL_COLLAPSED_PX = 64;
const POS_PAY_COLUMN_PX = 368 + 16; // columna de pago (23 rem) + separación del POS real
const PAGE_PADDING_PX = 32;

export interface RailBudget {
  label: string;
  note: string;
  railPx: number;
  contentPx: number;
  cartPx: number;
}

/** Ancho que queda en un PC de caja de 1366 px para el contenido y para la columna del carrito del POS. */
export function railBudgets(viewport = 1366): RailBudget[] {
  const mk = (label: string, note: string, railPx: number): RailBudget => {
    const contentPx = viewport - railPx;
    return { label, note, railPx, contentPx, cartPx: contentPx - PAGE_PADDING_PX - POS_PAY_COLUMN_PX };
  };
  return [
    mk("Riel expandido", "Pantallas de lectura", RAIL_EXPANDED_PX),
    mk("Riel solo íconos", "POS, caja, escaneo y picking", RAIL_COLLAPSED_PX),
    mk("Barra superior (hoy)", "Referencia: sin riel", 0),
  ];
}
