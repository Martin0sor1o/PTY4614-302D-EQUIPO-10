import { Bell, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Direction } from "../_lib/directions";
import { Wordmark } from "./brand";
import { CountBadge, NAV_ITEMS, Who } from "./nav";
import { SideRail } from "./rail";

/** A · barra superior clara, editorial: marca a la izquierda, opción activa subrayada. */
function TopLight({ d, current }: { d: Direction; current: string }) {
  return (
    <header data-menu className="border-b bg-[var(--dir-menu-bg)] text-[var(--dir-menu-fg)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 pb-2">
        <Wordmark id="A" className="text-[var(--dir-wordmark)]" />
        <Who d={d} />
      </div>
      <nav aria-label="Principal" className="flex flex-wrap gap-x-5 gap-y-1 px-4">
        {NAV_ITEMS.map((i) => {
          const active = i.label === current;
          return (
            <a
              key={i.label}
              href="#"
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 py-2 text-sm font-medium",
                active ? "border-[var(--dir-menu-active)] text-[var(--dir-menu-active)]" : "border-transparent hover:text-[var(--dir-menu-active)]",
              )}
            >
              {i.label}
              {i.badge ? <CountBadge n={i.badge} d={d} /> : null}
            </a>
          );
        })}
      </nav>
    </header>
  );
}

/** C · barra oscura de ciruela con detalles champán: mayúsculas espaciadas, activa con línea dorada. */
function TopDark({ d, current }: { d: Direction; current: string }) {
  return (
    <header data-menu className="bg-[var(--dir-menu-bg)] text-[var(--dir-menu-fg)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 pb-2">
        <Wordmark id="C" className="text-[var(--dir-wordmark)]" />
        <Who d={d} />
      </div>
      <nav aria-label="Principal" className="flex flex-wrap gap-x-5 gap-y-0 border-t border-white/15 px-4">
        {NAV_ITEMS.map((i) => {
          const active = i.label === current;
          return (
            <a
              key={i.label}
              href="#"
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 border-b-2 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em]",
                active ? "border-[var(--dir-accent)] text-[var(--dir-accent)]" : "border-transparent hover:text-[var(--dir-accent)]",
              )}
            >
              {i.label}
              {i.badge ? <CountBadge n={i.badge} d={d} /> : null}
            </a>
          );
        })}
      </nav>
    </header>
  );
}

/**
 * Menú de escritorio. `current` es la pantalla abierta (Stock o POS).
 * En los rieles, `collapsed` es el estado inicial: el POS siempre parte en solo íconos.
 */
export function DesktopMenu({ d, current, collapsed = false }: { d: Direction; current: string; collapsed?: boolean }) {
  if (d.layout === "rail") return <SideRail d={d} current={current} defaultCollapsed={collapsed} />;
  return d.id === "C" ? <TopDark d={d} current={current} /> : <TopLight d={d} current={current} />;
}

/** Celular: barra con botón de 44 px y menú abierto con filas de 44 px (lo que pedirá la Fase B). */
export function MobileMenu({ d }: { d: Direction }) {
  const dark = d.id === "C";
  const rail = d.layout === "rail";
  const onMenu = d.mobileDrawer === "menu";
  return (
    <div
      data-menu
      className={cn(
        "mx-auto w-full max-w-[375px] overflow-hidden border text-sm",
        d.ui.frame,
        onMenu ? "bg-[var(--dir-menu-bg)] text-[var(--dir-menu-fg)]" : "bg-card",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-1.5",
          rail || dark ? "bg-[var(--dir-menu-bg)] text-[var(--dir-menu-fg)]" : "border-b bg-[var(--dir-menu-bg)]",
        )}
      >
        <button type="button" aria-label="Abrir menú" className="grid size-11 place-items-center rounded-md">
          <Menu className="size-6" aria-hidden />
        </button>
        <Wordmark id={d.id} className="scale-[.8] text-[var(--dir-wordmark)]" />
        <button type="button" aria-label="Aprobaciones: 1 pendiente" className="relative grid size-11 place-items-center rounded-md">
          <Bell className="size-6" aria-hidden />
          <CountBadge n={1} d={d} className="absolute top-1 right-0.5" />
        </button>
      </div>
      <ul className="p-2">
        {NAV_ITEMS.slice(0, 5).map((i) => {
          const active = i.label === "Stock";
          return (
            <li key={i.label}>
              <a
                href="#"
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 px-3 font-medium",
                  rail ? "rounded-full" : dark ? "rounded-[2px] text-xs tracking-[0.1em] uppercase" : "rounded-md",
                  active && rail && "bg-[var(--dir-menu-active)] text-[var(--dir-menu-active-fg)]",
                  active && d.id === "A" && "bg-secondary text-[var(--dir-menu-active)]",
                  active && dark && "bg-[var(--dir-menu-bg)] text-[var(--dir-menu-fg)] shadow-[inset_3px_0_0_var(--dir-accent)]",
                )}
              >
                <i.icon className="size-5 shrink-0" aria-hidden />
                {i.label}
                {i.badge ? <CountBadge n={i.badge} d={d} active={active && rail} className="ml-auto" /> : null}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
