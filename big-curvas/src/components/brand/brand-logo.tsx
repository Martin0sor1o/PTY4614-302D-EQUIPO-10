import { existsSync } from "node:fs";
import path from "node:path";
import { cn } from "@/lib/utils";

const LOGO_FILE = "public/brand/logo.png";
const LOGO_URL = "/brand/logo.png";

// Se resuelve en el servidor para no parpadear: si el archivo existe se usa la imagen; si no, el logotipo de texto.
function hasLogoImage(): boolean {
  try {
    return existsSync(path.join(process.cwd(), LOGO_FILE));
  } catch {
    return false;
  }
}

const SIZES = {
  sm: { box: "h-9 px-3", text: "text-base", img: "h-9" },
  lg: { box: "h-16 px-6", text: "text-3xl", img: "h-16" },
} as const;

/**
 * Logo de Big Curvas: siempre sobre negro (el rosado claro no tiene contraste sobre fondo claro).
 * Para usar el logo definitivo basta dejar la imagen en `public/brand/logo.png`.
 */
export function BrandLogo({ size = "sm", className }: { size?: keyof typeof SIZES; className?: string }) {
  const s = SIZES[size];
  if (hasLogoImage()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tamaño de la imagen desconocido; next/image exige width/height
      <img src={LOGO_URL} alt="Big Curvas" className={cn("w-auto rounded-md", s.img, className)} />
    );
  }
  return (
    <span
      role="img"
      aria-label="Big Curvas"
      className={cn(
        "inline-flex items-center rounded-md bg-brand-black font-extrabold tracking-[0.14em] text-brand-pink",
        s.box,
        s.text,
        className,
      )}
    >
      <span aria-hidden>BIG CURVAS</span>
    </span>
  );
}
