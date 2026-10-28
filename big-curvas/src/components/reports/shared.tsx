import type { ReactNode } from "react";

/** Estado vacío: dice qué pasa y qué hacer, no deja una tabla en blanco. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-3xl border-2 border-dashed bg-card px-4 py-10 text-center" data-testid="empty-state">
      <p className="text-lg font-bold">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

/** "Cómo se calcula": las definiciones y supuestos a la vista (a validar con Belén, P-24). */
export function Definitions({ children }: { children: ReactNode }) {
  return (
    <details className="rounded-2xl border bg-card px-4 py-3 text-sm print:hidden">
      <summary className="cursor-pointer font-semibold text-brand-ink max-md:flex max-md:min-h-11 max-md:items-center">Cómo se calcula (supuestos a validar)</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{children}</ul>
    </details>
  );
}
