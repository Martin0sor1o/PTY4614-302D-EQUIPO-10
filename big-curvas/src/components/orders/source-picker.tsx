"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PickerLine {
  lineId: string;
  sku: string;
  description: string;
  /** Unidades que hay que apartar (la línea completa al pagar; lo que falta al completar). */
  qty: number;
  availability: { locationId: string; name: string; available: number }[];
}

/**
 * Regla (RN-04): se aparta en BODEGA. La tienda solo se ofrece cuando la bodega no tiene disponible para la línea
 * COMPLETA (una línea sale de una sola ubicación). El servidor vuelve a validarlo.
 */
export function needsStore(line: PickerLine, fulfillmentLocationId: string): boolean {
  const bodega = line.availability.find((a) => a.locationId === fulfillmentLocationId)?.available ?? 0;
  return bodega < line.qty;
}

export function LineSourcePicker({
  lines,
  fulfillmentLocationId,
  value,
  onChange,
}: {
  lines: PickerLine[];
  fulfillmentLocationId: string;
  /** lineId → tienda elegida. Sin entrada = bodega. */
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const short = lines.filter((l) => needsStore(l, fulfillmentLocationId));
  if (short.length === 0) return null;

  return (
    <fieldset className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/70 p-4" data-testid="source-picker">
      <legend className="px-1 font-medium text-amber-950">La bodega no alcanza para {short.length === 1 ? "esta prenda" : "estas prendas"}</legend>
      <p className="text-sm text-amber-950">
        Si la tienda tiene disponible, puedes apartarla ahí: se genera un traslado tienda → bodega ligado al pedido y el pedido espera a que llegue. Una línea sale de
        una sola ubicación.
      </p>
      {short.map((l) => {
        const bodega = l.availability.find((a) => a.locationId === fulfillmentLocationId);
        const stores = l.availability.filter((a) => a.locationId !== fulfillmentLocationId);
        const chosen = value[l.lineId];
        return (
          <div key={l.lineId} className="space-y-1.5" data-testid="source-line" data-sku={l.sku}>
            <div className="text-sm">
              <span className="font-mono text-xs">{l.sku}</span> · {l.description} · <strong>{l.qty}</strong> {l.qty === 1 ? "unidad" : "unidades"}
              <span className="text-muted-foreground">
                {" "}
                (bodega: {bodega?.available ?? 0})
              </span>
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Dónde apartar ${l.sku}`}>
              {stores.map((s) => {
                const enough = s.available >= l.qty;
                const selected = chosen === s.locationId;
                return (
                  <Button
                    key={s.locationId}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!enough}
                    variant={selected ? "default" : "outline"}
                    className={cn(!enough && "opacity-60")}
                    onClick={() => {
                      const next = { ...value };
                      if (selected) delete next[l.lineId];
                      else next[l.lineId] = s.locationId;
                      onChange(next);
                    }}
                  >
                    Apartar en {s.name} ({s.available} disp.)
                  </Button>
                );
              })}
              {stores.every((s) => s.available < l.qty) && (
                <span className="self-center text-sm font-medium text-red-800">Ninguna ubicación tiene disponible: repón stock o edita el pedido.</span>
              )}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
