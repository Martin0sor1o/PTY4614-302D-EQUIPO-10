import { Bell, BadgeCheck, Boxes, ChartColumn, House, Menu, MapPin, Package, ShoppingBag, Truck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Direction } from "../_lib/directions";
import { Wordmark } from "./brand";

const ITEMS: { label: string; icon: LucideIcon; badge?: number }[] = [
  { label: "Inicio", icon: House },
  { label: "Stock", icon: Boxes },
  { label: "POS", icon: ShoppingBag },
  { label: "Traslados", icon: Truck, badge: 2 },
  { label: "Pedidos", icon: Package, badge: 3 },
  { label: "Aprobaciones", icon: BadgeCheck, badge: 1 },
  { label: "Reportes", icon: ChartColumn },
];
const ACTIVE = "Stock";

function Badge({ n, d, className }: { n: number; d: Direction; className?: string }) {
  return (
    <span
      aria-label={`${n} pendiente${n === 1 ? "" : "s"}`}
      className={cn(
        "inline-flex min-w-5 items-center justify-center px-1.5 text-[11px] leading-5 font-bold",
        d.id === "A" && "rounded-full bg-primary text-primary-foreground",
        d.id === "B" && "rounded-full bg-[var(--dir-accent)] text-[#2B1F1A]",
        d.id === "C" && "rounded-[2px] bg-[var(--dir-accent)] text-[#1E1423]",
        className,
      )}
    >
      {n}
    </span>
  );
}

function Who({ d }: { d: Direction }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 font-medium",
          d.id === "A" && "rounded-md border border-border",
          d.id === "B" && "rounded-full bg-card/70",
          d.id === "C" && "rounded-[2px] border border-[var(--dir-accent)]",
        )}
      >
        <MapPin className="size-3.5" aria-hidden /> Tienda Rancagua
      </span>
      <span className="leading-tight">
        <b className="block font-semibold">Belén</b>
        <span className={d.id === "C" ? "opacity-85" : "text-muted-foreground"}>Administradora</span>
      </span>
    </div>
  );
}

/** A · barra superior clara, editorial: marca a la izquierda, opción activa subrayada. */
function TopLight({ d }: { d: Direction }) {
  return (
    <header className="border-b bg-[var(--dir-menu-bg)] text-[var(--dir-menu-fg)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 pb-2">
        <Wordmark id="A" className="text-[var(--dir-menu-active)]" />
        <Who d={d} />
      </div>
      <nav aria-label="Principal" className="flex flex-wrap gap-x-5 gap-y-1 px-4">
        {ITEMS.map((i) => {
          const active = i.label === ACTIVE;
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
              {i.badge ? <Badge n={i.badge} d={d} /> : null}
            </a>
          );
        })}
      </nav>
    </header>
  );
}

/** B · riel lateral cálido: solo íconos en espacio angosto, íconos + texto cuando hay ancho. */
function SideRail({ d }: { d: Direction }) {
  return (
    <aside className="flex w-16 shrink-0 flex-col gap-1 bg-[var(--dir-menu-bg)] p-2 text-[var(--dir-menu-fg)] @lg:w-48 @lg:p-3">
      <div className="px-1 pt-1 pb-3">
        <Wordmark id="B" className="hidden text-[var(--dir-menu-active)] @lg:inline-flex" />
        <span aria-hidden className="dir-display mx-auto grid size-10 place-items-center rounded-full bg-[var(--dir-menu-active)] text-sm font-semibold text-white @lg:hidden">
          BC
        </span>
      </div>
      <nav aria-label="Principal" className="flex flex-col gap-1">
        {ITEMS.map((i) => {
          const active = i.label === ACTIVE;
          return (
            <a
              key={i.label}
              href="#"
              title={i.label}
              aria-label={i.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 items-center justify-center gap-3 rounded-full px-3 text-sm font-medium @lg:justify-start",
                active ? "bg-[var(--dir-menu-active)] text-[var(--dir-menu-active-fg)]" : "hover:bg-card/70",
              )}
            >
              <i.icon className="size-5 shrink-0" aria-hidden />
              <span className="hidden @lg:inline">{i.label}</span>
              {i.badge ? (
                <>
                  <Badge n={i.badge} d={d} className="absolute top-0.5 right-0.5 @lg:static @lg:ml-auto" />
                </>
              ) : null}
            </a>
          );
        })}
      </nav>
      <div className="mt-auto hidden px-1 pt-3 text-xs @lg:block">
        <Who d={d} />
      </div>
    </aside>
  );
}

/** C · barra oscura de ciruela con detalles champán: mayúsculas espaciadas, activa con línea dorada. */
function TopDark({ d }: { d: Direction }) {
  return (
    <header className="bg-[var(--dir-menu-bg)] text-[var(--dir-menu-fg)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 pb-2">
        <Wordmark id="C" className="text-[var(--dir-accent)]" />
        <Who d={d} />
      </div>
      <nav aria-label="Principal" className="flex flex-wrap gap-x-5 gap-y-0 border-t border-white/15 px-4">
        {ITEMS.map((i) => {
          const active = i.label === ACTIVE;
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
              {i.badge ? <Badge n={i.badge} d={d} /> : null}
            </a>
          );
        })}
      </nav>
    </header>
  );
}

export function DesktopMenu({ d }: { d: Direction }) {
  if (d.id === "A") return <TopLight d={d} />;
  if (d.id === "C") return <TopDark d={d} />;
  return <SideRail d={d} />;
}

/** Celular: barra con botón de 44 px y menú abierto con filas de 44 px (lo que pedirá la Fase B). */
export function MobileMenu({ d }: { d: Direction }) {
  const dark = d.id === "C";
  return (
    <div className={cn("mx-auto w-full max-w-[375px] overflow-hidden border bg-card text-sm", d.ui.frame)}>
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-1.5",
          d.id === "B" ? "bg-[var(--dir-menu-bg)]" : dark ? "bg-[var(--dir-menu-bg)] text-[var(--dir-menu-fg)]" : "border-b bg-[var(--dir-menu-bg)]",
        )}
      >
        <button type="button" aria-label="Abrir menú" className="grid size-11 place-items-center rounded-md">
          <Menu className="size-6" aria-hidden />
        </button>
        <Wordmark id={d.id} className={cn("scale-[.8]", dark ? "text-[var(--dir-accent)]" : "text-[var(--dir-menu-active)]")} />
        <button type="button" aria-label="Aprobaciones: 1 pendiente" className="relative grid size-11 place-items-center rounded-md">
          <Bell className="size-6" aria-hidden />
          <Badge n={1} d={d} className="absolute top-1 right-0.5" />
        </button>
      </div>
      <ul className="p-2">
        {ITEMS.slice(0, 5).map((i) => {
          const active = i.label === ACTIVE;
          return (
            <li key={i.label}>
              <a
                href="#"
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 px-3 font-medium",
                  d.id === "B" ? "rounded-full" : d.id === "C" ? "rounded-[2px] uppercase tracking-[0.1em] text-xs" : "rounded-md",
                  active && d.id === "A" && "bg-secondary text-[var(--dir-menu-active)]",
                  active && d.id === "B" && "bg-[var(--dir-menu-active)] text-white",
                  active && d.id === "C" && "bg-[var(--dir-menu-bg)] text-[var(--dir-menu-fg)] shadow-[inset_3px_0_0_var(--dir-accent)]",
                )}
              >
                <i.icon className="size-5 shrink-0" aria-hidden />
                {i.label}
                {i.badge ? <Badge n={i.badge} d={d} className="ml-auto" /> : null}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
