"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveDifferencesAction } from "@/app/(app)/traslados/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RESOLUTION_LABEL, type Resolution } from "./labels";

export interface DifferenceLine {
  lineId: string;
  sku: string;
  description: string;
  qtySent: number;
  qtyReceived: number;
  resolution: Resolution | null;
  originName: string;
}

/** Qué hace cada resolución con el stock (RN-30), dicho en palabras de la tienda. */
function effect(line: DifferenceLine, r: Resolution): string {
  const d = line.qtySent - line.qtyReceived;
  if (d < 0) return `Descuenta ${-d} del stock de ${line.originName}: salieron de más y la guía no lo anotó.`;
  if (r === "MERMA") return `No cambia el stock: se asume ${d} perdida${d === 1 ? "" : "s"} en el camino.`;
  if (r === "REENVIO") return `Devuelve ${d} al stock de ${line.originName} y crea un traslado nuevo en borrador para volver a mandarlas.`;
  return `Devuelve ${d} al stock de ${line.originName}: la guía anotó de más y nunca salieron.`;
}

const OPTIONS_SHORT: Resolution[] = ["MERMA", "REENVIO", "ERROR_ENVIO"];

/** Solo Belén. Resuelve por línea; el traslado se cierra cuando todas las líneas con diferencia están resueltas. */
export function ResolvePanel({ transferId, lines }: { transferId: string; lines: DifferenceLine[] }) {
  const router = useRouter();
  const key = useRef(crypto.randomUUID());
  const pendingLines = lines.filter((l) => l.resolution === null);
  const [choice, setChoice] = useState<Record<string, Resolution | "">>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ closed: boolean; reshipTransferId: string | null; reshipNumber: string | null } | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = pendingLines.filter((l) => choice[l.lineId]);
  // Con el traslado ya cerrado solo se queda el aviso de la resolución recién hecha (p. ej. el borrador de reenvío).
  if (pendingLines.length === 0 && !done) return null;

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await resolveDifferencesAction({
        transferId,
        resolutions: chosen.map((l) => ({ lineId: l.lineId, resolution: choice[l.lineId] as Resolution })),
        notes: notes.trim() || undefined,
        idempotencyKey: key.current,
      });
      if (!res.ok) return setError(res.message);
      setDone(res);
      key.current = crypto.randomUUID(); // la próxima resolución parcial es otra operación
      setChoice({});
      setNotes("");
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4" aria-labelledby="resolve-title" data-testid="resolve-panel">
      <div>
        <h2 id="resolve-title" className="font-semibold">
          Resolver diferencias
        </h2>
        <p className="text-sm text-muted-foreground">
          Elige qué pasó con cada prenda. Puedes resolver unas ahora y otras después; el traslado se cierra cuando estén todas.
        </p>
      </div>

      {done && (
        <p role="status" className="text-sm font-medium text-emerald-800" data-testid="resolve-done">
          {done.closed ? "Diferencias resueltas: el traslado quedó cerrado." : "Resolución guardada. Quedan prendas por resolver."}
          {done.reshipTransferId && (
            <>
              {" "}
              Se creó el borrador{" "}
              <Link href={`/traslados/${done.reshipTransferId}`} className="underline">
                {done.reshipNumber}
              </Link>{" "}
              para reenviar.
            </>
          )}
        </p>
      )}

      {pendingLines.length > 0 && (
        <>
          <ul className="space-y-3">
            {pendingLines.map((l) => {
              const d = l.qtySent - l.qtyReceived;
              const options = d > 0 ? OPTIONS_SHORT : (["ERROR_ENVIO"] as Resolution[]);
              const selected = choice[l.lineId] ?? "";
              return (
                <li key={l.lineId} className="rounded-lg border bg-card p-3" data-testid="difference-line">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs">{l.sku}</span> <span className="text-sm">{l.description}</span>
                    </div>
                    <div className="text-sm font-medium text-amber-800">
                      Enviado {l.qtySent} · recibido {l.qtyReceived} → {d > 0 ? `faltan ${d}` : `sobran ${-d}`}
                    </div>
                  </div>
                  <label className="mt-2 block text-sm font-medium" htmlFor={`res-${l.lineId}`}>
                    Resolución
                  </label>
                  <select
                    id={`res-${l.lineId}`}
                    className="mt-1 h-9 w-full max-w-md rounded-lg border border-input bg-background px-2 text-sm"
                    value={selected}
                    onChange={(e) => setChoice((prev) => ({ ...prev, [l.lineId]: e.target.value as Resolution | "" }))}
                  >
                    <option value="">Elegir…</option>
                    {options.map((o) => (
                      <option key={o} value={o}>
                        {d > 0 ? RESOLUTION_LABEL[o] : "Error de envío (salió más de lo anotado)"}
                      </option>
                    ))}
                  </select>
                  {selected && <p className="mt-1 text-sm text-muted-foreground">{effect(l, selected)}</p>}
                </li>
              );
            })}
          </ul>

          <div className="space-y-1">
            <label htmlFor="resolve-notes" className="text-sm font-medium">
              Notas (opcional)
            </label>
            <Textarea id="resolve-notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <Button type="button" size="lg" className="h-11 px-4" onClick={submit} disabled={pending || chosen.length === 0}>
            {pending ? "Resolviendo…" : chosen.length === 0 ? "Resolver" : `Resolver ${chosen.length} ${chosen.length === 1 ? "prenda" : "prendas"}`}
          </Button>
        </>
      )}
    </section>
  );
}
