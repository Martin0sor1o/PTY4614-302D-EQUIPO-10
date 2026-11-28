import type { ReactNode } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACTION_CLASS = cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 px-4 max-md:h-11");

/**
 * El siguiente paso de un estado vacío. `reload` navega con recarga completa: se usa cuando la pantalla tiene campos
 * que guardan lo escrito (búsqueda, filtro de fechas) y deben volver a cero junto con los datos.
 */
export function EmptyAction({ href, reload = false, children }: { href: string; reload?: boolean; children: ReactNode }) {
  if (reload || href.startsWith("#")) {
    return (
      <a href={href} className={ACTION_CLASS} data-testid="empty-action">
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={ACTION_CLASS} data-testid="empty-action">
      {children}
    </Link>
  );
}

/** Texto de un vacío y, debajo, qué hacer ahora. Sirve dentro de una tabla, una lista o una tarjeta. */
export function EmptyLine({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
      <p>{children}</p>
      {action}
    </div>
  );
}
