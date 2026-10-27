import type { ReactNode } from "react";

/** Estado vacío: dice qué pasa y qué hacer, no deja una tabla en blanco. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-4 py-10 text-center" data-testid="empty-state">
      <p className="font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

/** "Cómo se calcula": las definiciones y supuestos a la vista (a validar con Belén, P-24). */
export function Definitions({ children }: { children: ReactNode }) {
  return (
    <details className="rounded-xl border bg-card px-4 py-3 text-sm print:hidden">
      <summary className="cursor-pointer font-medium text-brand-ink">Cómo se calcula (supuestos a validar)</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{children}</ul>
    </details>
  );
}
