import { existsSync } from "node:fs";
import path from "node:path";
import { cn } from "@/lib/utils";

/*
 * ÚNICO lugar de la marca. Para usar el logo definitivo de Belén basta una de estas dos cosas:
 *  1) dejar la imagen en `public/brand/logo.png` (se usa sola, en el mismo tamaño); o
 *  2) reemplazar el contenido de <TypographicWordmark /> de abajo.
 * Nadie más dibuja la marca: el riel, el menú móvil y el login usan <Wordmark />.
 */
const LOGO_FILE = "public/brand/logo.png";
const LOGO_URL = "/brand/logo.png";

// Se resuelve en el servidor para no parpadear: si el archivo existe se usa la imagen.
function hasLogoImage(): boolean {
  try {
    return existsSync(path.join(process.cwd(), LOGO_FILE));
  } catch {
    return false;
  }
}

const SIZES = {
  sm: { big: "text-xs tracking-[0.5em]", name: "text-[1.7rem]", img: "h-10" },
  lg: { big: "text-sm tracking-[0.55em]", name: "text-5xl", img: "h-20" },
} as const;

/** Sobre fondo negro la marca va en rosado; sobre fondo claro, en vino (el rosado claro no tiene contraste sobre claro). */
const TONES = { onDark: "text-brand-pink", onLight: "text-primary" } as const;

function TypographicWordmark({ size }: { size: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <span className="font-display inline-flex flex-col leading-none" aria-hidden>
      <span className={cn("font-bold uppercase", s.big)}>Big</span>
      <span className={cn("-mt-0.5 font-bold italic", s.name)}>Curvas</span>
    </span>
  );
}

export function Wordmark({
  size = "sm",
  tone = "onDark",
  className,
}: {
  size?: keyof typeof SIZES;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  if (hasLogoImage()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tamaño de la imagen desconocido; next/image exige width/height
      <img src={LOGO_URL} alt="Big Curvas" className={cn("w-auto", SIZES[size].img, className)} />
    );
  }
  return (
    <span role="img" aria-label="Big Curvas" className={cn("inline-block", TONES[tone], className)}>
      <TypographicWordmark size={size} />
    </span>
  );
}
