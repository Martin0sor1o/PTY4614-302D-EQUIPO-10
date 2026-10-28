"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, ScanLine } from "lucide-react";
import { prepareOrderAction } from "@/app/(app)/pedidos/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";

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
  const [confirmOpen, setConfirmOpen] = useState(false);
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
    setMessage(null);
    startTransition(async () => {
      const res = await prepareOrderAction({
        orderId,
        scanned: lines.map((l) => ({ variantId: l.variantId, qty: counts[l.variantId] ?? 0 })),
        idempotencyKey: key.current,
      });
      if (!res.ok) {
        setConfirmOpen(false);
        return setMessage({ kind: "error", text: res.message });
      }
      router.push(`/pedidos/${orderId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Celular: el campo de escaneo y el último aviso quedan fijos arriba mientras se recorren las tarjetas. */}
      <div className="space-y-3 max-sm:sticky max-sm:top-0 max-sm:z-10 max-sm:-mx-4 max-sm:bg-background max-sm:px-4 max-sm:py-2 max-sm:shadow-soft">
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
        <Notice tone={message.kind === "error" ? "danger" : "ok"} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </Notice>
      )}
      </div>

      {/* Celular (bajo sm): una tarjeta por prenda, sin scroll horizontal. */}
      <ul className="space-y-3 sm:hidden" aria-label="Prendas del pedido">
        {lines.map((l) => {
          const n = counts[l.variantId] ?? 0;
          return (
            <li key={l.variantId} className="rounded-2xl border bg-card p-3 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold">{l.sku}</div>
                  <div className="text-sm">{l.description}</div>
                </div>
                {n === l.quantity ? (
                  <StatusBadge tone="ok" icon={Check}>
                    Completa
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="warn">Faltan {l.quantity - n}</StatusBadge>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Pedido <span className="text-base font-bold text-foreground tabular-nums">{l.quantity}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon-sm" aria-label={`Quitar una unidad de ${l.sku}`} onClick={() => bump(l, -1)}>
                    <Minus />
                  </Button>
                  <span className="w-12 text-center text-2xl font-bold tabular-nums">{n}</span>
                  <Button type="button" variant="outline" size="icon-sm" aria-label={`Sumar una unidad de ${l.sku}`} onClick={() => bump(l, 1)}>
                    <Plus />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="hidden rounded-3xl border bg-card shadow-soft sm:block">
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
                      <StatusBadge tone="ok" icon={Check}>
                        Completa
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="warn">Faltan {l.quantity - n}</StatusBadge>
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
        <Button type="button" size="lg" className="h-11 px-4" onClick={() => setConfirmOpen(true)} disabled={pending || !complete}>
          {pending ? "Preparando…" : "Confirmar preparación"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar preparación"
        description={`¿Confirmar la preparación de ${number}? El stock de la bodega bajará en ${expected} unidad${expected === 1 ? "" : "es"}.`}
        confirmLabel="Sí, confirmar"
        pending={pending}
        onConfirm={confirm}
        finalFocusRef={inputRef}
      />
    </div>
  );
}
