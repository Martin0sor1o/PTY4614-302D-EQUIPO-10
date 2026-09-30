"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Tiempo real" de la demo: vuelve a pedir la página al servidor cada ~3 s (router.refresh conserva el estado
 * de los componentes cliente, p. ej. lo escrito en la búsqueda). No refresca si la pestaña está oculta.
 */
export function AutoRefresh({ renderedAt, intervalMs = 3000 }: { renderedAt: string; intervalMs?: number }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, router]);

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      <span
        aria-hidden
        className={cn("size-2 rounded-full", enabled ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/40")}
      />
      <span>
        {enabled ? "En vivo" : "Pausado"} · actualizado {renderedAt}
      </span>
      <Button type="button" variant="ghost" size="xs" onClick={() => setEnabled((e) => !e)}>
        {enabled ? "Pausar" : "Reanudar"}
      </Button>
    </div>
  );
}
