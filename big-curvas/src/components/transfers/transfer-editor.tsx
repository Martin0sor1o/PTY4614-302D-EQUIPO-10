"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ScanLine, Trash2 } from "lucide-react";
import {
  cancelDraftAction,
  createDraftAction,
  searchVariantsAction,
  updateDraftAction,
} from "@/app/(app)/traslados/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface EditorLine {
  variantId: string;
  sku: string;
  description: string;
  qty: number;
  /** Disponible en el origen cuando se agregó (informativo: la validación real es al enviar). */
  available: number | null;
}

/**
 * Editor de borrador: escaneo con foco permanente (el lector "escribe" el código y envía Enter) o búsqueda.
 * No valida stock al agregar; solo avisa si hoy no alcanzaría. La validación real es al enviar.
 */
export function TransferEditor({
  transferId,
  fromName,
  toName,
  initialLines,
}: {
  transferId?: string;
  fromName: string;
  toName: string;
  initialLines: EditorLine[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<EditorLine[]>(initialLines);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Awaited<ReturnType<typeof searchVariantsAction>> | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // La misma clave para todos los reintentos de "crear" (doble clic, red lenta): un solo borrador.
  const createKey = useRef(crypto.randomUUID());

  function add(item: { variantId: string; sku: string; productName: string; color: string; size: string; available: number }) {
    setLines((prev) => {
      const found = prev.find((l) => l.variantId === item.variantId);
      if (found) return prev.map((l) => (l.variantId === item.variantId ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...prev,
        {
          variantId: item.variantId,
          sku: item.sku,
          description: `${item.productName} · ${item.color} · T${item.size}`,
          qty: 1,
          available: item.available,
        },
      ];
    });
    setHits(null);
    setQuery("");
    setMessage(null);
    inputRef.current?.focus();
  }

  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    const res = await searchVariantsAction(q);
    setSearching(false);
    if (!res.ok) {
      setMessage({ kind: "error", text: res.message });
      return;
    }
    if (res.items.length === 1) return add(res.items[0]);
    if (res.items.length === 0) {
      setHits(null);
      setMessage({ kind: "error", text: `No hay prendas para “${q}”.` });
      return;
    }
    setMessage(null);
    setHits(res);
  }

  function setQty(variantId: string, qty: number) {
    setLines((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, qty: Math.max(1, Math.min(10_000, qty || 1)) } : l)));
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const payload = lines.map((l) => ({ variantId: l.variantId, qty: l.qty }));
      const res = transferId
        ? await updateDraftAction({ transferId, lines: payload })
        : await createDraftAction({ lines: payload, idempotencyKey: createKey.current });
      if (!res.ok) return setMessage({ kind: "error", text: res.message });
      router.push(`/traslados/${res.transferId}`);
      router.refresh();
    });
  }

  function cancel() {
    if (!transferId) return router.push("/traslados");
    if (!window.confirm("¿Anular este borrador? No se puede deshacer.")) return;
    startTransition(async () => {
      const res = await cancelDraftAction({ transferId });
      if (!res.ok) return setMessage({ kind: "error", text: res.message });
      router.push("/traslados");
      router.refresh();
    });
  }

  const units = lines.reduce((a, l) => a + l.qty, 0);

  return (
    <div className="space-y-4">
      <form
        role="search"
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <div className="relative w-full sm:max-w-lg">
          <ScanLine className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            ref={inputRef}
            autoFocus
            autoComplete="off"
            aria-label="Escanear o buscar prenda"
            placeholder="Escanea el código de barras o busca por SKU o nombre…"
            className="h-11 pl-8 text-base"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline" size="lg" className="h-11 px-4" disabled={searching}>
          {searching ? "Buscando…" : "Buscar"}
        </Button>
      </form>

      {message && (
        <p role="alert" className={cn("text-sm font-medium", message.kind === "error" ? "text-red-700" : "text-muted-foreground")}>
          {message.text}
        </p>
      )}

      {hits?.ok && hits.items.length > 1 && (
        <ul className="divide-y rounded-xl border bg-card" aria-label="Resultados de la búsqueda">
          {hits.items.map((item) => (
            <li key={item.variantId}>
              <button
                type="button"
                onClick={() => add(item)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left outline-none hover:bg-muted focus-visible:bg-muted"
              >
                <span>
                  <span className="font-mono text-xs">{item.sku}</span>
                  <span className="ml-2 text-sm">
                    {item.productName} · {item.color} · T{item.size}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">Disponible aquí: {item.available}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Prenda</TableHead>
              <TableHead className="text-center">Cantidad</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Escanea la primera prenda para armar el traslado de {fromName} a {toName}.
                </TableCell>
              </TableRow>
            )}
            {lines.map((l) => (
              <TableRow key={l.variantId} data-testid="editor-line">
                <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                <TableCell>
                  {l.description}
                  {l.available !== null && l.qty > l.available && (
                    <div className="text-xs text-amber-700">
                      Hoy hay {l.available} disponible{l.available === 1 ? "" : "s"} en {fromName}; se valida al enviar.
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <Button type="button" variant="outline" size="icon-sm" aria-label={`Quitar una unidad de ${l.sku}`} onClick={() => setQty(l.variantId, l.qty - 1)}>
                      <Minus />
                    </Button>
                    <Input
                      inputMode="numeric"
                      aria-label={`Cantidad de ${l.sku}`}
                      className="h-8 w-16 text-center tabular-nums"
                      value={l.qty}
                      onChange={(e) => setQty(l.variantId, Number(e.target.value.replace(/\D/g, "")))}
                    />
                    <Button type="button" variant="outline" size="icon-sm" aria-label={`Agregar una unidad de ${l.sku}`} onClick={() => setQty(l.variantId, l.qty + 1)}>
                      <Plus />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Quitar ${l.sku}`}
                    onClick={() => setLines((prev) => prev.filter((x) => x.variantId !== l.variantId))}
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" data-testid="editor-total">
          {lines.length} {lines.length === 1 ? "prenda distinta" : "prendas distintas"} · {units} {units === 1 ? "unidad" : "unidades"}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="lg" className="h-11 px-4" onClick={cancel} disabled={pending}>
            {transferId ? "Anular borrador" : "Cancelar"}
          </Button>
          <Button type="button" size="lg" className="h-11 px-4" onClick={save} disabled={pending || lines.length === 0}>
            {pending ? "Guardando…" : "Guardar borrador"}
          </Button>
        </div>
      </div>
    </div>
  );
}
