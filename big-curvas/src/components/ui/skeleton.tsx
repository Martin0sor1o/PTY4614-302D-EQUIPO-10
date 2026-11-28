import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Bloque gris que ocupa el lugar de algo que está cargando. Es decorativo: lo anuncia `SkeletonScreen`. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden data-slot="skeleton" className={cn("animate-pulse rounded-xl bg-secondary motion-reduce:animate-none", className)} />;
}

/** Pantalla de carga: dice qué se está cargando (para lectores de pantalla) y dibuja la silueta. */
export function SkeletonScreen({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" className={cn("space-y-4", className)} data-testid="loading-skeleton">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Filas de una tabla o lista. */
export function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div aria-hidden className="space-y-3 rounded-3xl border bg-card p-4 shadow-soft">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}
