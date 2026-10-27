"use client";

import { useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Direction } from "../_lib/directions";
import { Wordmark } from "./brand";
import { CountBadge, NAV_ITEMS, Who, type NavItem } from "./nav";

/**
 * Riel lateral colapsable. Sin animación (nada que retrase el trabajo en caja).
 * Con poco ancho de contenedor siempre queda en solo íconos; con ancho, el botón alterna entre íconos y texto.
 */
export function SideRail({ d, current, defaultCollapsed = false }: { d: Direction; current: string; defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const wide = !collapsed;
  const ToggleIcon = wide ? ChevronsLeft : ChevronsRight;
  return (
    <aside
      data-menu
      className={cn(
        "flex shrink-0 flex-col gap-1 bg-[var(--dir-menu-bg)] p-2 text-[var(--dir-menu-fg)]",
        wide ? "w-16 @lg:w-48 @lg:p-3" : "w-16",
        d.id === "E" && "border-r",
      )}
    >
      <div className="px-1 pt-1 pb-3">
        <Wordmark id={d.id} className={cn("text-[var(--dir-wordmark)]", wide ? "hidden @lg:inline-flex" : "hidden")} />
        <span
          aria-hidden
          className={cn(
            "dir-display mx-auto grid size-10 place-items-center rounded-full bg-[var(--dir-menu-active)] text-sm font-semibold text-[var(--dir-menu-active-fg)]",
            wide && "@lg:hidden",
          )}
        >
          BC
        </span>
      </div>
      <nav aria-label="Principal" className="flex flex-col gap-1">
        {NAV_ITEMS.map((i) => {
          return <RailLink key={i.label} d={d} item={i} wide={wide} active={i.label === current} />;
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-2 pt-3">
        <div className={cn("hidden px-1 text-xs", wide && "@lg:block")}>
          <Who d={d} />
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={wide}
          aria-label={wide ? "Contraer menú a solo íconos" : "Expandir menú"}
          title={wide ? "Contraer menú" : "Expandir menú"}
          className="hidden min-h-11 items-center justify-center gap-2 rounded-full px-3 text-xs font-medium hover:bg-card/60 @lg:flex"
        >
          <ToggleIcon className="size-5 shrink-0" aria-hidden />
          {wide && <span>Contraer</span>}
        </button>
      </div>
    </aside>
  );
}

function RailLink({ d, item, wide, active }: { d: Direction; item: NavItem; wide: boolean; active: boolean }) {
  return (
    <a
      href="#"
      title={item.label}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 items-center justify-center gap-3 rounded-full px-3 text-sm font-medium",
        wide && "@lg:justify-start",
        active ? "bg-[var(--dir-menu-active)] text-[var(--dir-menu-active-fg)]" : "hover:bg-card/60",
        d.id === "D" && !active && "hover:bg-white/10",
      )}
    >
      <item.icon className="size-5 shrink-0" aria-hidden />
      <span className={cn("hidden", wide && "@lg:inline")}>{item.label}</span>
      {item.badge ? <CountBadge n={item.badge} d={d} active={active} className={cn("absolute top-0.5 right-0.5", wide && "@lg:static @lg:ml-auto")} /> : null}
    </a>
  );
}
