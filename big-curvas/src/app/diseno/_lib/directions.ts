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

const TONES_A: Direction["tones"] = {
  ok: ["#1F6B4A", "#E3F2EA"], warn: ["#85500A", "#FBEBCB"], danger: ["#A32020", "#FBE2E0"],
  info: ["#1E4F8A", "#E1ECF8"], neutral: ["#4A4045", "#EFE6E8"], violet: ["#5B2A86", "#EDE3F6"],
};

/** Paleta actual del sistema (negro, rosado #FFF5F8, vino #9D1F52): base de D, E y F. */
const CURRENT = { bg: "#FFF5F8", surface: "#FFFFFF", ink: "#0A0A0A", muted: "#5C5359", border: "#EAD3DC", input: "#8C6F7C", soft: "#FCE7EF", accent: "#F5C6D6", link: "#9D1F52" };

export const DIRECTIONS: Direction[] = [
  {
    id: "A",
    name: "Rosa Editorial",
    tagline: "Revista de moda: marfil rosado, vino profundo y mucho aire. Es la evolución más directa de la identidad actual.",
    layout: "top",
    density: "cómoda",
    railStartsCollapsed: false,
    mobileDrawer: "card",
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
      soft: "#F6E4E8", menuBg: "#FFFFFF", menuFg: "#2A1A20", menuActive: "#8A1C4A", menuActiveFg: "#8A1C4A", menuRing: "#B3245F",
      wordmark: "#8A1C4A", badgeBg: "#8A1C4A", badgeFg: "#FFFFFF", badgeActiveBg: "#8A1C4A", badgeActiveFg: "#FFFFFF",
      accent: "#E7B4C3",
    },
    tones: TONES_A,
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
      badge: "rounded-full",
      iconCircle: "text-primary",
      hlHead: "bg-primary/10",
      hlCell: "bg-primary/5",
      cell: "py-2",
    },
  },
  {
    id: "B",
    name: "Terracota Cálida",
    tagline: "Boutique de barrio con calidez: crema, terracota y salvia. Formas suaves y redondeadas; cercana y segura.",
    layout: "rail",
    density: "cómoda",
    railStartsCollapsed: false,
    mobileDrawer: "card",
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
      soft: "#F3E6D6", menuBg: "#F3E6D6", menuFg: "#2B1F1A", menuActive: "#A2402B", menuActiveFg: "#FFFFFF", menuRing: "#B5472C",
      wordmark: "#A2402B", badgeBg: "#F2B79B", badgeFg: "#2B1F1A", badgeActiveBg: "#F2B79B", badgeActiveFg: "#2B1F1A",
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
      badge: "rounded-full",
      iconCircle: "rounded-full bg-secondary text-primary",
      hlHead: "bg-primary/10",
      hlCell: "bg-primary/5",
      cell: "py-2",
    },
  },
  {
    id: "C",
    name: "Ciruela Deco",
    tagline: "Boutique de lujo discreto: ciruela, champán y líneas rectas de inspiración art déco. Moderna y segura de sí misma.",
    layout: "top",
    density: "cómoda",
    railStartsCollapsed: false,
    mobileDrawer: "card",
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
      soft: "#ECE4F1", menuBg: "#2A1235", menuFg: "#F1E6D0", menuActive: "#C8A96A", menuActiveFg: "#F1E6D0", menuRing: "#C8A96A",
      wordmark: "#C8A96A", badgeBg: "#C8A96A", badgeFg: "#1E1423", badgeActiveBg: "#C8A96A", badgeActiveFg: "#1E1423",
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
      badge: "rounded-[2px]",
      iconCircle: "rounded-[2px] border border-foreground/30 text-primary",
      hlHead: "bg-[#4B1D5E]",
      hlCell: "bg-primary/5",
      cell: "py-2",
    },
  },
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
      displayVar: "var(--font-d-display)",
      bodyVar: "var(--font-d-body)",
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
    tones: TONES_A,
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
  {
    id: "E",
    name: "Porcelana",
    tagline: "Todo claro y luminoso: riel blanco y botón principal negro. El vino aparece como énfasis y al pasar el cursor. La más sobria.",
    layout: "rail",
    density: "cómoda",
    railStartsCollapsed: false,
    mobileDrawer: "card",
    fonts: {
      display: "Outfit",
      body: "Hanken Grotesk",
      displayVar: "var(--font-e-display)",
      bodyVar: "var(--font-e-body)",
      why: "Geométrica moderna y amable para títulos y marca en minúsculas; Hanken Grotesk, neutra y nítida en cifras y tablas.",
    },
    radius: "Radios muy grandes (20–32 px), campos y botones en píldora",
    shadow: "Sombras neutras, largas y muy suaves",
    icons: "Trazo 1,75 en un círculo rosado pálido",
    radiusRem: "1rem",
    stroke: 1.75,
    colors: {
      ...CURRENT,
      primary: "#0A0A0A", primaryFg: "#FFFFFF", primaryHover: "#9D1F52", ring: "#9D1F52",
      menuBg: "#FFFFFF", menuFg: "#0A0A0A", menuActive: "#0A0A0A", menuActiveFg: "#FFFFFF", menuRing: "#9D1F52",
      wordmark: "#9D1F52", badgeBg: "#9D1F52", badgeFg: "#FFFFFF", badgeActiveBg: "#FFFFFF", badgeActiveFg: "#0A0A0A",
    },
    tones: TONES_A,
    ui: {
      h1: "text-[1.9rem] font-semibold leading-tight tracking-tight",
      button: "h-11 rounded-full px-6 text-sm font-semibold shadow-[0_6px_14px_-6px_rgba(10,10,10,0.45)]",
      buttonSm: "h-9 rounded-full px-4 text-xs font-semibold",
      card: "ring-1 ring-foreground/10 shadow-[0_10px_30px_-14px_rgba(10,10,10,0.35)]",
      thead: "text-[13px] font-semibold text-foreground",
      tableWrap: "rounded-3xl border bg-card shadow-[0_8px_24px_-12px_rgba(10,10,10,0.22)]",
      field: "h-11 rounded-full bg-card px-4",
      chip: "rounded-full",
      frame: "rounded-3xl border",
      badge: "rounded-full",
      iconCircle: "rounded-full bg-secondary text-foreground",
      hlHead: "bg-secondary",
      hlCell: "bg-secondary/50",
      cell: "py-2",
    },
  },
  {
    id: "F",
    name: "Rosa Taller",
    tagline: "Pensada para la caja y las tablas: densidad compacta, riel rosado suave que parte colapsado y vino para la acción. La que más pantalla útil deja.",
    layout: "rail",
    density: "compacta",
    railStartsCollapsed: true,
    mobileDrawer: "card",
    fonts: {
      display: "Newsreader",
      body: "Public Sans",
      displayVar: "var(--font-f-display)",
      bodyVar: "var(--font-f-body)",
      why: "Serif suave de lectura para títulos y marca; Public Sans, pensada para interfaces densas, con cifras muy claras.",
    },
    radius: "Radios medianos (12–20 px), botones en píldora",
    shadow: "Sombras mínimas, para no recargar tablas densas",
    icons: "Trazo 2,25 en un círculo vino con ícono blanco",
    radiusRem: "0.625rem",
    stroke: 2.25,
    colors: {
      ...CURRENT,
      primary: "#9D1F52", primaryFg: "#FFFFFF", primaryHover: "#7E1742", ring: "#9D1F52",
      menuBg: "#F9DCE7", menuFg: "#0A0A0A", menuActive: "#9D1F52", menuActiveFg: "#FFFFFF", menuRing: "#7E1742",
      wordmark: "#9D1F52", badgeBg: "#0A0A0A", badgeFg: "#FFFFFF", badgeActiveBg: "#FFFFFF", badgeActiveFg: "#9D1F52",
    },
    tones: TONES_A,
    ui: {
      h1: "text-2xl font-semibold leading-tight tracking-tight",
      button: "h-9 rounded-full px-4 text-[13px] font-semibold shadow-[0_3px_8px_-4px_rgba(157,31,82,0.5)]",
      buttonSm: "h-8 rounded-full px-3 text-xs font-semibold",
      card: "ring-1 ring-foreground/10 shadow-[0_4px_14px_-8px_rgba(157,31,82,0.35)] [--card-spacing:--spacing(3)]",
      thead: "h-8 text-[11px] font-bold uppercase tracking-wide text-muted-foreground",
      tableWrap: "rounded-2xl border bg-card [&_tbody_tr:nth-child(even)]:bg-[#FFF5F8]",
      field: "h-9 rounded-xl bg-card",
      chip: "rounded-full",
      frame: "rounded-2xl border",
      badge: "rounded-full",
      iconCircle: "rounded-full bg-primary text-primary-foreground",
      hlHead: "bg-primary/10",
      hlCell: "bg-primary/5",
      cell: "py-1",
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
