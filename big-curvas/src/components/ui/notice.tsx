import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONE_ICON, type StatusTone } from "./status-badge";

const TONE_BOX: Record<StatusTone, string> = {
  ok: "border-tone-ok/30 bg-tone-ok-soft text-tone-ok",
  warn: "border-tone-warn/30 bg-tone-warn-soft text-tone-warn",
  danger: "border-tone-danger/30 bg-tone-danger-soft text-tone-danger",
  info: "border-tone-info/30 bg-tone-info-soft text-tone-info",
  neutral: "border-tone-neutral/30 bg-tone-neutral-soft text-tone-neutral",
  violet: "border-tone-violet/30 bg-tone-violet-soft text-tone-violet",
};

/** Aviso en recuadro (avisos de demo, éxito, error). Lleva ícono y, opcionalmente, título: nunca solo color. */
export function Notice({
  tone,
  title,
  children,
  className,
  ...props
}: { tone: StatusTone; title?: ReactNode } & Omit<ComponentProps<"div">, "title">) {
  const Icon = TONE_ICON[tone];
  return (
    <div
      data-slot="notice"
      className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm", TONE_BOX[tone], className)}
      {...props}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}
