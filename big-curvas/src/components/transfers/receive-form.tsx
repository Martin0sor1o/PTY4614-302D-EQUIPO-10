"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, ScanLine } from "lucide-react";
import { receiveTransferAction } from "@/app/(app)/traslados/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface ReceiveLine {
  variantId: string;
  sku: string;
  barcode: string;
  description: string;
  qtySent: number;
}

// Mismo texto que InventoryService (regla pendiente P-23): aquí solo se avisa antes; el servidor decide.
const FOREIGN_ITEM = "Esta prenda no viene en el traslado. Sepárala y avisa a Belén.";

/** Recepción escaneando: cada código suma una unidad; la guía (enviado) está a la vista. */
export function ReceiveForm({ transferId, number, lines }: { transferId: string; number: string; lines: ReceiveLine[] }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [l.variantId, 0])));
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const key = useRef(crypto.randomUUID());

  const byCode = useMemo(() => {
    const map = new Map<string, ReceiveLine>();
    for (const l of lines) {
      map.set(l.barcode.toLowerCase(), l);
      map.set(l.sku.toLowerCase(), l);
    }
    return map;
  }, [lines]);

  function bump(variantId: string, delta: number) {
    setCounts((prev) => ({ ...prev, [variantId]: Math.max(0, Math.min(10_000, (prev[variantId] ?? 0) + delta)) }));
  }

  function scan() {
    const c = code.trim().toLowerCase();
    if (!c) return;
    const line = byCode.get(c);
    setCode("");
    if (!line) {
      setMessage({ kind: "error", text: FOREIGN_ITEM });
    } else {
      bump(line.variantId, 1);
      setMessage({ kind: "ok", text: `${line.sku} · ${line.description}` });
    }
    inputRef.current?.focus();
  }

  const diffs = lines
    .map((l) => ({ line: l, diff: (counts[l.variantId] ?? 0) - l.qtySent }))
    .filter((d) => d.diff !== 0);
  const scanned = lines.reduce((a, l) => a + (counts[l.variantId] ?? 0), 0);
  const expected = lines.reduce((a, l) => a + l.qtySent, 0);

  function confirm() {
    const summary = diffs.length
      ? `Hay diferencias en ${diffs.length} prenda${diffs.length === 1 ? "" : "s"}. Al confirmar, el stock sube solo con lo escaneado y Belén resolverá la diferencia. ¿Confirmar la recepción de ${number}?`
      : `¿Confirmar la recepción de ${number}? El stock subirá con lo escaneado.`;
    if (!window.confirm(summary)) return;
    setMessage(null);
    startTransition(async () => {
      const res = await receiveTransferAction({
        transferId,
        lines: lines.map((l) => ({ variantId: l.variantId, qty: counts[l.variantId] ?? 0 })),
        idempotencyKey: key.current,
      });
      if (!res.ok) return setMessage({ kind: "error", text: res.message });
      router.push(`/traslados/${transferId}`);
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
          aria-label="Escanear prenda recibida"
          placeholder="Escanea cada prenda que recibes…"
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
              <TableHead className="text-center">Enviado</TableHead>
              <TableHead className="text-center">Escaneado</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => {
              const n = counts[l.variantId] ?? 0;
              const diff = n - l.qtySent;
              return (
                <TableRow key={l.variantId} data-testid="receive-line">
                  <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                  <TableCell>{l.description}</TableCell>
                  <TableCell className="text-center tabular-nums">{l.qtySent}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button type="button" variant="outline" size="icon-sm" aria-label={`Quitar una unidad de ${l.sku}`} onClick={() => bump(l.variantId, -1)}>
                        <Minus />
                      </Button>
                      <span className="w-10 text-center text-lg font-semibold tabular-nums" data-testid="scanned-count">
                        {n}
                      </span>
                      <Button type="button" variant="outline" size="icon-sm" aria-label={`Sumar una unidad de ${l.sku}`} onClick={() => bump(l.variantId, 1)}>
                        <Plus />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {diff === 0 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <Check className="size-4" /> Cuadra
                      </span>
                    ) : diff < 0 ? (
                      <span className="font-medium text-amber-700">Faltan {-diff}</span>
                    ) : (
                      <span className="font-medium text-amber-700">Sobran {diff}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" data-testid="receive-total">
          Escaneadas {scanned} de {expected} unidades enviadas
          {diffs.length > 0 && <span className="font-medium text-amber-700"> · {diffs.length} con diferencia</span>}
        </p>
        <Button type="button" size="lg" className="h-11 px-4" onClick={confirm} disabled={pending}>
          {pending ? "Recibiendo…" : "Confirmar recepción"}
        </Button>
      </div>
    </div>
  );
}
