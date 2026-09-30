"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Búsqueda por SKU, código de barras o nombre. Actualiza `?q=` (con pausa de 300 ms al escribir; Enter busca
 * al tiro, que es lo que hace el lector de códigos al terminar de "tipear").
 */
export function StockSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const lastPushed = useRef(initial);

  function go(raw: string) {
    const q = raw.trim();
    if (q === lastPushed.current) return;
    lastPushed.current = q;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    startTransition(() => router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false }));
  }

  useEffect(() => {
    const t = setTimeout(() => go(value), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `go` solo depende de valores estables del router
  }, [value]);

  return (
    <form
      role="search"
      className="relative w-full sm:max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        go(value);
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        autoFocus
        aria-label="Buscar prenda"
        placeholder="Buscar por SKU, código de barras o nombre…"
        className="pl-8"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {pending && <span className="absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">Buscando…</span>}
    </form>
  );
}
