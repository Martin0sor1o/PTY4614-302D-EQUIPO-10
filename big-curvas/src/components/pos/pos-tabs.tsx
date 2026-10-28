"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/pos", label: "Venta" },
  { href: "/pos/ventas", label: "Ventas del día" },
  { href: "/pos/caja", label: "Caja" },
] as const;

export function PosTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b print:hidden" aria-label="POS">
      {TABS.map((t) => {
        const active = t.href === "/pos" ? pathname === "/pos" || pathname.startsWith("/pos/ticket") : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center border-b-2 px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors max-md:min-h-11",
              active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
