"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Bell, ChevronsLeft, ChevronsRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ICONS } from "./nav-icons";
import { RAIL_COOKIE, isCriticalRoute } from "./rail-pref";

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
        "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-5 font-bold",
        active ? "bg-brand-black text-brand-pink" : "bg-brand-pink-strong text-brand-black",
        className,
      )}
    >
      {n}
    </span>
  );
}

function NavRow({ item, active, collapsed, onNavigate }: { item: NavEntry; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = NAV_ICONS[item.href];
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 items-center gap-3 rounded-full px-3 text-sm font-semibold",
        collapsed && "justify-center",
        active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "hover:bg-white/10",
      )}
    >
      {Icon && <Icon className="size-5 shrink-0" aria-hidden />}
      <span className={cn(collapsed && "sr-only")}>{item.label}</span>
      {item.badge ? <CountPill n={item.badge} active={active} className={collapsed ? "absolute top-0.5 right-0.5" : "ml-auto"} /> : null}
    </Link>
  );
}

/**
 * Riel lateral de escritorio (md en adelante), colapsable, sin animación.
 * Lectura: expandido por defecto y la preferencia se recuerda (cookie). Pantallas críticas: parte en solo íconos;
 * el botón lo expande solo mientras se esté en ellas.
 */
export function DesktopRail({ items, brand, initialExpanded, demo }: { items: NavEntry[]; brand: ReactNode; initialExpanded: boolean; demo: boolean }) {
  const pathname = usePathname();
  const critical = isCriticalRoute(pathname);
  const [expandedRead, setExpandedRead] = useState(initialExpanded);
  const [expandedCritical, setExpandedCritical] = useState(false);
  const expanded = critical ? expandedCritical : expandedRead;
  const collapsed = !expanded;

  function toggle() {
    if (critical) return setExpandedCritical(!expandedCritical);
    setExpandedRead(!expandedRead);
    try {
      document.cookie = `${RAIL_COOKIE}=${expandedRead ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      /* sin cookies: la preferencia solo dura la visita */
    }
  }

  const Toggle = expanded ? ChevronsLeft : ChevronsRight;
  return (
    <aside
      data-rail
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col gap-1 overflow-y-auto bg-sidebar p-2 text-sidebar-foreground md:flex print:hidden",
        expanded && "w-52 p-3",
        collapsed && "w-16",
      )}
    >
      <div className={cn("flex flex-col gap-2 px-1 pt-1 pb-4", collapsed && "items-center px-0")}>
        <Link href="/" aria-label="Big Curvas, inicio" className="rounded-lg">
          {collapsed ? (
            <span aria-hidden className="font-display grid size-10 place-items-center rounded-full bg-sidebar-primary text-lg font-bold text-sidebar-primary-foreground italic">
              BC
            </span>
          ) : (
            brand
          )}
        </Link>
        {demo && expanded && (
          <span className="w-fit rounded-full border border-brand-pink/60 px-2 text-[11px] leading-5 font-bold tracking-wider text-brand-pink">DEMO</span>
        )}
      </div>

      <nav aria-label="Principal" className="flex flex-col gap-1">
        {items.map((item) => (
          <NavRow key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={collapsed} />
        ))}
      </nav>

      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        title={expanded ? "Contraer menú a solo íconos" : "Expandir menú"}
        className={cn("mt-auto flex min-h-11 items-center gap-3 rounded-full px-3 text-sm font-semibold hover:bg-white/10", collapsed && "justify-center")}
      >
        <Toggle className="size-5 shrink-0" aria-hidden />
        <span className={cn(collapsed && "sr-only")}>{expanded ? "Contraer menú" : "Expandir menú"}</span>
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
        <Dialog.Trigger aria-label="Abrir menú" className="grid size-11 place-items-center rounded-full hover:bg-white/10">
          <Menu className="size-6" aria-hidden />
        </Dialog.Trigger>
        <Link href="/" aria-label="Big Curvas, inicio" className="rounded-lg">
          {brand}
        </Link>
        {approvals ? (
          <Link
            href={approvals.href}
            aria-label={approvals.badge ? `Aprobaciones: ${approvals.badge} pendiente${approvals.badge === 1 ? "" : "s"}` : "Aprobaciones"}
            className="relative grid size-11 place-items-center rounded-full hover:bg-white/10"
          >
            <Bell className="size-6" aria-hidden />
            {approvals.badge ? <CountPill n={approvals.badge} active={false} className="absolute top-1 right-0.5" /> : null}
          </Link>
        ) : (
          <span className="size-11" aria-hidden />
        )}
      </div>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 md:hidden" />
        <Dialog.Popup
          data-rail
          className="fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-72 flex-col gap-1 overflow-y-auto bg-sidebar p-3 text-sidebar-foreground shadow-xl md:hidden"
        >
          <Dialog.Title className="sr-only">Menú principal</Dialog.Title>
          <div className="flex items-start justify-between gap-2 px-1 pb-3">
            {brand}
            <Dialog.Close aria-label="Cerrar menú" className="grid size-11 place-items-center rounded-full hover:bg-white/10">
              <X className="size-6" aria-hidden />
            </Dialog.Close>
          </div>
          <nav aria-label="Principal" className="flex flex-col gap-1">
            {items.map((item) => (
              <NavRow key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={false} onNavigate={close} />
            ))}
          </nav>
          {children && <div className="mt-auto space-y-3 border-t border-sidebar-border pt-4 text-sm">{children}</div>}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
