import { CircleAlert, CircleCheck, Clock, FileText, Hourglass, PackageCheck, TriangleAlert, Truck, Ban, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Direction, DirectionId, Tone } from "../_lib/directions";

/** Wordmark tipográfico de cada dirección; hereda el color del texto (`currentColor`). */
export function Wordmark({ id, className }: { id: DirectionId; className?: string }) {
  if (id === "A") {
    return (
      <span aria-label="Big Curvas" className={cn("dir-display inline-block text-[1.9rem] leading-none font-semibold", className)}>
        <span aria-hidden>
          <i className="font-medium">Big</i> Curvas
        </span>
      </span>
    );
  }
  if (id === "B") {
    return (
      <span aria-label="Big Curvas" className={cn("dir-display inline-flex flex-col text-[1.7rem] leading-none font-semibold", className)}>
        <span aria-hidden>Big Curvas</span>
        <svg aria-hidden viewBox="0 0 120 10" className="mt-1 h-2 w-24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M2 7 C 30 -2, 60 -2, 90 6 S 112 7 118 4" />
        </svg>
      </span>
    );
  }
  if (id === "D") {
    return (
      <span aria-label="Big Curvas" className={cn("dir-display inline-flex flex-col leading-none", className)}>
        <span aria-hidden className="text-[10px] font-bold tracking-[0.5em] uppercase">Big</span>
        <span aria-hidden className="-mt-0.5 text-[1.9rem] font-bold italic">Curvas</span>
      </span>
    );
  }
  if (id === "E") {
    return (
      <span aria-label="Big Curvas" className={cn("dir-display inline-flex items-center gap-1.5 text-[1.55rem] leading-none font-semibold tracking-tight lowercase", className)}>
        <svg aria-hidden viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M20 8 A9 9 0 1 0 20 16" />
        </svg>
        <span aria-hidden>big curvas</span>
      </span>
    );
  }
  if (id === "F") {
    return (
      <span aria-label="Big Curvas" className={cn("dir-display inline-flex items-center gap-1.5 text-[1.45rem] leading-none font-semibold", className)}>
        <svg aria-hidden viewBox="0 0 28 14" className="h-3.5 w-7 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M2 10 C 7 -2, 13 -2, 14 7 S 21 14, 26 3" />
        </svg>
        <span aria-hidden>Big Curvas</span>
      </span>
    );
  }
  return (
    <span aria-label="Big Curvas" className={cn("dir-display inline-flex flex-col text-lg leading-none font-medium uppercase tracking-[0.34em]", className)}>
      <span aria-hidden>Big Curvas</span>
      <span aria-hidden className="mt-1.5 block h-px w-full bg-[var(--dir-accent)]" />
    </span>
  );
}

/** Adorno de cabecera, SVG propio. */
export function Ornament({ id, className }: { id: DirectionId; className?: string }) {
  const common = { "aria-hidden": true, className: cn("h-10 w-auto", className), fill: "none", stroke: "currentColor" } as const;
  if (id === "A") {
    return (
      <svg {...common} viewBox="0 0 120 40" strokeWidth="1">
        <path d="M2 34 C 30 34, 40 6, 60 6 S 90 34, 118 34" />
        <path d="M18 34 C 38 34, 46 14, 60 14 S 82 34, 102 34" />
        <circle cx="60" cy="6" r="2" fill="currentColor" />
      </svg>
    );
  }
  if (id === "B") {
    return (
      <svg {...common} viewBox="0 0 120 40" strokeWidth="2" strokeLinecap="round">
        <path d="M6 36 V22 a18 18 0 0 1 36 0 V36" />
        <path d="M42 36 V18 a18 18 0 0 1 36 0 V36" opacity=".6" />
        <path d="M78 36 V26 a14 14 0 0 1 28 0 V36" opacity=".35" />
      </svg>
    );
  }
  if (id === "D") {
    return (
      <svg {...common} viewBox="0 0 120 40" strokeWidth="2" strokeLinecap="round">
        <path d="M6 36 C 6 14, 30 4, 60 4 S 114 14, 114 36" />
        <path d="M22 36 C 22 20, 40 12, 60 12 S 98 20, 98 36" opacity=".6" />
        <path d="M38 36 C 38 28, 48 22, 60 22 S 82 28, 82 36" opacity=".35" />
      </svg>
    );
  }
  if (id === "E") {
    return (
      <svg {...common} viewBox="0 0 120 40" strokeWidth="1.75">
        <circle cx="26" cy="20" r="14" />
        <circle cx="60" cy="20" r="14" opacity=".6" />
        <circle cx="94" cy="20" r="14" opacity=".3" />
      </svg>
    );
  }
  if (id === "F") {
    return (
      <svg {...common} viewBox="0 0 120 40" strokeWidth="2.25" strokeLinecap="round">
        <path d="M4 12 C 20 -2, 36 -2, 52 12 S 84 26, 100 12" />
        <path d="M20 30 C 36 16, 52 16, 68 30 S 100 38, 116 24" opacity=".5" />
      </svg>
    );
  }
  return (
    <svg {...common} viewBox="0 0 120 40" strokeWidth="1.5">
      <path d="M60 36 V4 M60 36 L28 10 M60 36 L92 10 M60 36 L10 22 M60 36 L110 22" />
      <path d="M4 36 H116" />
    </svg>
  );
}

export const TONE_ICON: Record<Tone, LucideIcon> = {
  ok: CircleCheck,
  warn: TriangleAlert,
  danger: Ban,
  info: Truck,
  neutral: FileText,
  violet: Hourglass,
};

export interface ChipSpec {
  label: string;
  tone: Tone;
  icon?: LucideIcon;
}

/** Estados del sistema: siempre color + ícono + texto, nunca solo color. */
export const CHIPS = {
  paid: { label: "Pagado", tone: "ok", icon: CircleCheck },
  pending: { label: "Pendiente de pago", tone: "warn", icon: Clock },
  low: { label: "Stock bajo", tone: "warn", icon: TriangleAlert },
  transit: { label: "En tránsito", tone: "info", icon: Truck },
  prepared: { label: "Preparado", tone: "info", icon: PackageCheck },
  toResolve: { label: "Por resolver", tone: "violet", icon: Hourglass },
  voided: { label: "Anulado", tone: "danger", icon: Ban },
  none: { label: "Sin stock", tone: "danger", icon: CircleAlert },
  draft: { label: "Borrador", tone: "neutral", icon: FileText },
} satisfies Record<string, ChipSpec>;

export function StatusChip({ spec, d, className }: { spec: ChipSpec; d: Direction; className?: string }) {
  const Icon = spec.icon ?? TONE_ICON[spec.tone];
  return (
    <span
      className={cn("inline-flex items-center gap-1 px-2 py-0.5 text-xs leading-5 font-semibold whitespace-nowrap", d.ui.chip, className)}
      style={{ color: `var(--st-${spec.tone}-fg)`, background: `var(--st-${spec.tone}-bg)` }}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {spec.label}
    </span>
  );
}
