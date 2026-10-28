"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Bell, ChevronsLeft, ChevronsRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ICONS } from "./nav-icons";
import { RAIL_ATTR, setRailCollapsed } from "./rail-pref";

export interface NavEntry {
  href: string;
  label: string;
  badge?: number;
}

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

function CountPill({ n, active, className }: { n: number; active: boolean; className?: string }) {
  return (
    <span
      data-testid="nav-badge"
      aria-label={`${n} pendiente${n === 1 ? "" : "s"}`}
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs leading-5 font-bold",
        active ? "bg-brand-black text-brand-pink" : "bg-brand-pink-strong text-brand-black",
        className,
      )}
    >
      {n}
    </span>
  );
}

/**
 * En el riel de escritorio el modo «solo íconos» se resuelve con CSS a partir del atributo `data-rail-collapsed` de <html>
 * (lo pone el script de app/layout.tsx antes de pintar), así no hay parpadeo al cargar. El cajón de celular nunca se contrae.
 */
function NavRow({ item, active, rail, onNavigate }: { item: NavEntry; active: boolean; rail?: boolean; onNavigate?: () => void }) {
  const Icon = NAV_ICONS[item.href];
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={rail ? item.label : undefined}
      className={cn(
        "relative flex min-h-11 items-center gap-2.5 rounded-full px-3 text-sm font-semibold",
        rail && "in-data-[rail-collapsed]:justify-center in-data-[rail-collapsed]:px-0",
        active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "hover:bg-sidebar-accent",
      )}
    >
      {Icon && <Icon className="size-5 shrink-0" aria-hidden />}
      <span className={cn(rail && "in-data-[rail-collapsed]:sr-only")}>{item.label}</span>
      {item.badge ? (
        <CountPill
          n={item.badge}
          active={active}
          className={
            rail
              ? "ml-auto in-data-[rail-collapsed]:absolute in-data-[rail-collapsed]:top-0.5 in-data-[rail-collapsed]:right-0.5 in-data-[rail-collapsed]:ml-0"
              : "ml-auto"
          }
        />
      ) : null}
    </Link>
  );
}

const subscribeRail = (notify: () => void) => {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [RAIL_ATTR] });
  return () => observer.disconnect();
};
const railCollapsed = () => document.documentElement.hasAttribute(RAIL_ATTR);

/**
 * Riel lateral de escritorio (md en adelante), sin animación. Parte abierto en todas las pantallas (también POS, caja,
 * escaneo y picking); solo el botón de contraer lo cambia, y la elección se recuerda en localStorage (ver rail-pref.ts).
 */
export function DesktopRail({ items, brand, demo }: { items: NavEntry[]; brand: ReactNode; demo: boolean }) {
  const pathname = usePathname();
  // El diseño sale del CSS; este estado solo alimenta aria-expanded y el nombre del botón.
  const collapsed = useSyncExternalStore(subscribeRail, railCollapsed, () => false);

  return (
    <aside
      data-rail
      className="sticky top-0 hidden h-screen w-48 shrink-0 flex-col gap-1 overflow-y-auto bg-sidebar p-2 text-sidebar-foreground in-data-[rail-collapsed]:w-16 md:flex print:hidden"
    >
      <div className="flex flex-col gap-2 px-1 pt-1 pb-4 in-data-[rail-collapsed]:items-center in-data-[rail-collapsed]:px-0">
        <Link href="/" aria-label="Big Curvas, inicio" className="rounded-lg">
          <span className="in-data-[rail-collapsed]:hidden">{brand}</span>
          <span
            aria-hidden
            className="font-display hidden size-10 place-items-center rounded-full bg-sidebar-primary text-lg font-bold text-sidebar-primary-foreground italic in-data-[rail-collapsed]:grid"
          >
            BC
          </span>
        </Link>
        {demo && (
          <span className="w-fit rounded-full border border-brand-pink/60 px-2 text-xs leading-5 font-bold tracking-wider text-brand-pink in-data-[rail-collapsed]:hidden">
            DEMO
          </span>
        )}
      </div>

      <nav aria-label="Principal" className="flex flex-col gap-1">
        {items.map((item) => (
          <NavRow key={item.href} item={item} active={isActive(pathname, item.href)} rail />
        ))}
      </nav>

      <button
        type="button"
        onClick={() => setRailCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
        title={collapsed ? "Expandir menú" : "Contraer menú a solo íconos"}
        className="mt-auto flex min-h-11 items-center gap-2.5 rounded-full px-3 text-sm font-semibold hover:bg-sidebar-accent in-data-[rail-collapsed]:justify-center in-data-[rail-collapsed]:px-0"
      >
        <ChevronsLeft className="size-5 shrink-0 in-data-[rail-collapsed]:hidden" aria-hidden />
        <ChevronsRight className="hidden size-5 shrink-0 in-data-[rail-collapsed]:block" aria-hidden />
        <span aria-hidden className="in-data-[rail-collapsed]:hidden">
          Contraer menú
        </span>
      </button>
    </aside>
  );
}

/** Menú de celular (bajo md): barra negra con botón de 44 px y cajón con filas de 44 px. */
export function MobileBar({ items, brand, children }: { items: NavEntry[]; brand: ReactNode; children?: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const approvals = items.find((i) => i.href === "/aprobaciones");
  const close = () => setOpen(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div data-rail className="flex items-center justify-between gap-2 bg-sidebar px-1.5 py-1 text-sidebar-foreground md:hidden print:hidden">
        <Dialog.Trigger aria-label="Abrir menú" className="grid size-11 place-items-center rounded-full hover:bg-sidebar-accent">
          <Menu className="size-6" aria-hidden />
        </Dialog.Trigger>
        <Link href="/" aria-label="Big Curvas, inicio" className="rounded-lg">
          {brand}
        </Link>
        {approvals ? (
          <Link
            href={approvals.href}
            aria-label={approvals.badge ? `Aprobaciones: ${approvals.badge} pendiente${approvals.badge === 1 ? "" : "s"}` : "Aprobaciones"}
            className="relative grid size-11 place-items-center rounded-full hover:bg-sidebar-accent"
          >
            <Bell className="size-6" aria-hidden />
            {approvals.badge ? <CountPill n={approvals.badge} active={false} className="absolute top-1 right-0.5" /> : null}
          </Link>
        ) : (
          <span className="size-11" aria-hidden />
        )}
      </div>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-brand-black/50 md:hidden" />
        <Dialog.Popup
          data-rail
          className="fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-72 flex-col gap-1 overflow-y-auto bg-sidebar p-3 text-sidebar-foreground shadow-xl md:hidden"
        >
          <Dialog.Title className="sr-only">Menú principal</Dialog.Title>
          <div className="flex items-start justify-between gap-2 px-1 pb-3">
            {brand}
            <Dialog.Close aria-label="Cerrar menú" className="grid size-11 place-items-center rounded-full hover:bg-sidebar-accent">
              <X className="size-6" aria-hidden />
            </Dialog.Close>
          </div>
          <nav aria-label="Principal" className="flex flex-col gap-1">
            {items.map((item) => (
              <NavRow key={item.href} item={item} active={isActive(pathname, item.href)} onNavigate={close} />
            ))}
          </nav>
          {children && <div className="mt-auto space-y-3 border-t border-sidebar-border pt-4 text-sm">{children}</div>}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
