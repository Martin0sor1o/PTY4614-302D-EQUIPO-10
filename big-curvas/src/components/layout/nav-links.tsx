"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Menú sobre fondo negro: activo = rosado con texto negro; inactivo = rosado suave sobre negro.
export function NavLinks({ items }: { items: { href: string; label: string; badge?: number }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="Principal">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-pink-strong",
              active
                ? "bg-brand-pink text-brand-black"
                : "text-brand-pink/80 hover:bg-brand-pink hover:text-brand-black",
            )}
          >
            {item.label}
            {item.badge ? (
              <span
                data-testid="nav-badge"
                aria-label={`${item.badge} pendiente${item.badge === 1 ? "" : "s"}`}
                className={cn(
                  "ml-1.5 inline-block min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] leading-none font-semibold",
                  active ? "bg-brand-black text-brand-pink" : "bg-brand-pink text-brand-black",
                )}
              >
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
