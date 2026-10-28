"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { fillShortageAction } from "@/app/(app)/pedidos/actions";
import { Button } from "@/components/ui/button";
import { LineSourcePicker, needsStore, type PickerLine } from "./source-picker";

/** Completar faltante: tras una merma o un error de envío, aparta lo que falta (bodega, o tienda con traslado nuevo). */
export function FillShortage({
  orderId,
  number,
  fulfillmentLocationId,
  lines,
}: {
  orderId: string;
  number: string;
  fulfillmentLocationId: string;
  lines: PickerLine[];
}) {
  const router = useRouter();
  const [sources, setSources] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const key = useRef(crypto.randomUUID());
  const units = lines.reduce((a, l) => a + l.qty, 0);

  function submit() {
    setMessage(null);
    const unresolved = lines.filter((l) => needsStore(l, fulfillmentLocationId) && !sources[l.lineId]);
    if (unresolved.length > 0) return setMessage(`Elige dónde apartar ${unresolved.map((l) => l.sku).join(", ")} (la bodega no alcanza).`);
    if (!window.confirm(`¿Completar el faltante de ${number} (${units} unidad${units === 1 ? "" : "es"})?`)) return;
    startTransition(async () => {
      const res = await fillShortageAction({
        orderId,
        lineSources: Object.entries(sources).map(([lineId, locationId]) => ({ lineId, locationId })),
        idempotencyKey: key.current,
      });
      if (!res.ok) {
        key.current = crypto.randomUUID();
        setMessage(res.message);
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-2xl border border-tone-warn/30 bg-tone-warn-soft/60 p-4" aria-labelledby="sec-faltante" data-testid="fill-shortage">
      <h2 id="sec-faltante" className="flex items-center gap-2 text-lg font-bold text-tone-warn">
        <AlertTriangle className="size-4" aria-hidden /> Faltan {units} unidad{units === 1 ? "" : "es"} del pedido
      </h2>
      <ul className="text-sm text-tone-warn">
        {lines.map((l) => (
          <li key={l.lineId}>
            <span className="font-mono text-xs">{l.sku}</span> · {l.description}: faltan <strong>{l.qty}</strong>
          </li>
        ))}
      </ul>
      <p className="text-sm text-tone-warn">
        Las diferencias del traslado ya están resueltas, pero estas unidades no están apartadas. Complétalas con las mismas reglas de “confirmar pago”, o cancela el
        pedido.
      </p>
      <LineSourcePicker lines={lines} fulfillmentLocationId={fulfillmentLocationId} value={sources} onChange={setSources} />
      {message && (
        <p role="alert" className="text-sm font-medium text-tone-danger" data-testid="fill-error">
          {message}
        </p>
      )}
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "Completando…" : "Completar faltante"}
      </Button>
    </section>
  );
}
