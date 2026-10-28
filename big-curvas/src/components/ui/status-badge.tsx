import type { ComponentProps } from "react";
import { CircleAlert, CircleCheck, FileText, Hourglass, Truck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tonos de estado del sistema; sus colores salen de los tokens `--tone-*` de globals.css. */
export type StatusTone = "ok" | "warn" | "danger" | "info" | "neutral" | "violet";

const TONE_STYLE: Record<StatusTone, string> = {
  ok: "bg-tone-ok-soft text-tone-ok",
  warn: "bg-tone-warn-soft text-tone-warn",
  danger: "bg-tone-danger-soft text-tone-danger",
  info: "bg-tone-info-soft text-tone-info",
  neutral: "bg-tone-neutral-soft text-tone-neutral",
  violet: "bg-tone-violet-soft text-tone-violet",
};

/** Ícono por omisión de cada tono, para cuando el estado no trae el suyo. */
export const TONE_ICON: Record<StatusTone, LucideIcon> = {
  ok: CircleCheck,
  warn: CircleAlert,
  danger: CircleAlert,
  info: Truck,
  neutral: FileText,
  violet: Hourglass,
};

/**
 * Único badge de estado del sistema (stock bajo, por resolver, pagado, anulado, en tránsito…).
 * Siempre muestra color + ícono + texto: nunca comunica el estado solo con el color.
 */
export function StatusBadge({
  tone,
  icon,
  className,
  children,
  ...props
}: { tone: StatusTone; icon?: LucideIcon } & ComponentProps<"span">) {
  const Icon = icon ?? TONE_ICON[tone];
  return (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 font-sans text-xs leading-5 font-semibold tracking-normal whitespace-nowrap normal-case",
        TONE_STYLE[tone],
        className,
      )}
      {...props}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {children}
    </span>
  );
}
