"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Menú sobre fondo negro: activo = rosado con texto negro; inactivo = rosado suave sobre negro.
export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
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
          </Link>
        );
      })}
    </nav>
  );
}
