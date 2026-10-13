"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, ScanLine } from "lucide-react";
import { prepareOrderAction } from "@/app/(app)/pedidos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface PickLine {
  variantId: string;
  sku: string;
  barcode: string;
  description: string;
  quantity: number;
}

/**
 * Picking: cada código escaneado suma una unidad. Se rechaza al instante una prenda que no es del pedido o que ya
 * está completa; "Confirmar preparación" solo se habilita cuando todo coincide. El servidor valida lo mismo
 * y recién ahí baja el stock (`VENTA_ONLINE`).
 */
export function PickForm({ orderId, number, lines }: { orderId: string; number: string; lines: PickLine[] }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [l.variantId, 0])));
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const key = useRef(crypto.randomUUID());

  const byCode = useMemo(() => {
    const map = new Map<string, PickLine>();
    for (const l of lines) {
      map.set(l.barcode.toLowerCase(), l);
      map.set(l.sku.toLowerCase(), l);
    }
    return map;
  }, [lines]);

  function scan() {
    const c = code.trim().toLowerCase();
    if (!c) return;
    setCode("");
    const line = byCode.get(c);
    if (!line) {
      setMessage({ kind: "error", text: `Esa prenda no es del pedido ${number}. Sepárala y no la incluyas.` });
    } else if ((counts[line.variantId] ?? 0) >= line.quantity) {
      setMessage({ kind: "error", text: `${line.sku} ya está completa (${line.quantity} de ${line.quantity}). Esa unidad sobra.` });
    } else {
      setCounts((prev) => ({ ...prev, [line.variantId]: (prev[line.variantId] ?? 0) + 1 }));
      setMessage({ kind: "ok", text: `${line.sku} · ${line.description}` });
    }
    inputRef.current?.focus();
  }

  const bump = (l: PickLine, delta: number) =>
    setCounts((prev) => ({ ...prev, [l.variantId]: Math.max(0, Math.min(l.quantity, (prev[l.variantId] ?? 0) + delta)) }));

  const picked = lines.reduce((a, l) => a + (counts[l.variantId] ?? 0), 0);
  const expected = lines.reduce((a, l) => a + l.quantity, 0);
  const complete = lines.every((l) => (counts[l.variantId] ?? 0) === l.quantity);

  function confirm() {
    if (!window.confirm(`¿Confirmar la preparación de ${number}? El stock de la bodega bajará en ${expected} unidad${expected === 1 ? "" : "es"}.`)) return;
    setMessage(null);
    startTransition(async () => {
      const res = await prepareOrderAction({
        orderId,
        scanned: lines.map((l) => ({ variantId: l.variantId, qty: counts[l.variantId] ?? 0 })),
        idempotencyKey: key.current,
      });
      if (!res.ok) return setMessage({ kind: "error", text: res.message });
      router.push(`/pedidos/${orderId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form
        className="relative w-full sm:max-w-lg"
        onSubmit={(e) => {
          e.preventDefault();
          scan();
        }}
      >
        <ScanLine className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          autoFocus
          autoComplete="off"
          aria-label="Escanear prenda del pedido"
          placeholder="Escanea cada prenda que pones en la bolsa…"
          className="h-11 pl-8 text-base"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </form>

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={cn("text-sm font-medium", message.kind === "error" ? "text-red-700" : "text-emerald-700")}>
          {message.text}
        </p>
      )}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Prenda</TableHead>
              <TableHead className="text-center">Pedido</TableHead>
              <TableHead className="text-center">Escaneado</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => {
              const n = counts[l.variantId] ?? 0;
              return (
                <TableRow key={l.variantId} data-testid="pick-line">
                  <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                  <TableCell>{l.description}</TableCell>
                  <TableCell className="text-center tabular-nums">{l.quantity}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button type="button" variant="outline" size="icon-sm" aria-label={`Quitar una unidad de ${l.sku}`} onClick={() => bump(l, -1)}>
                        <Minus />
                      </Button>
                      <span className="w-10 text-center text-lg font-semibold tabular-nums" data-testid="picked-count">
                        {n}
                      </span>
                      <Button type="button" variant="outline" size="icon-sm" aria-label={`Sumar una unidad de ${l.sku}`} onClick={() => bump(l, 1)}>
                        <Plus />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {n === l.quantity ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <Check className="size-4" /> Completa
                      </span>
                    ) : (
                      <span className="font-medium text-amber-700">Faltan {l.quantity - n}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" data-testid="pick-total">
          Escaneadas {picked} de {expected} unidades
        </p>
        <Button type="button" size="lg" className="h-11 px-4" onClick={confirm} disabled={pending || !complete}>
          {pending ? "Preparando…" : "Confirmar preparación"}
        </Button>
      </div>
    </div>
  );
}
