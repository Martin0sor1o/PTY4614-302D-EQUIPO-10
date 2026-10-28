"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmPaymentAction } from "@/app/(app)/pedidos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCLP } from "@/lib/money";
import { quotePayment } from "@/modules/sales/client";
import { cn } from "@/lib/utils";
import { LineSourcePicker, needsStore, type PickerLine } from "./source-picker";

const METHODS = [
  { value: "TRANSFERENCIA", label: "Transferencia", referenceLabel: "N° de transferencia" },
  { value: "DEBITO", label: "Tarjeta de débito", referenceLabel: "N° de voucher" },
  { value: "CREDITO", label: "Tarjeta de crédito", referenceLabel: "N° de voucher" },
  { value: "EFECTIVO", label: "Efectivo", referenceLabel: "" },
] as const;

type Method = (typeof METHODS)[number]["value"];

/**
 * Confirmar pago: medio + referencia. Al confirmar se aparta el stock en bodega y se registra la venta.
 * Si una prenda ya no tiene disponible, el servidor lo informa y la página recarga la disponibilidad por línea.
 */
export function PayForm({
  orderId,
  number,
  total,
  fulfillmentLocationId,
  lines,
}: {
  orderId: string;
  number: string;
  total: number;
  fulfillmentLocationId: string;
  lines: PickerLine[];
}) {
  const router = useRouter();
  // lineId → tienda elegida para las líneas que la bodega no cubre completas. Sin entrada = bodega.
  const [sources, setSources] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<Method>("TRANSFERENCIA");
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Misma clave para los reintentos de esta pantalla (doble clic): una sola venta y una sola reserva.
  const key = useRef(crypto.randomUUID());

  const current = METHODS.find((m) => m.value === method)!;
  const quote = quotePayment(total, method);

  function confirm() {
    setMessage(null);
    if (method !== "EFECTIVO" && !reference.trim()) return setMessage(`Ingresa el ${current.referenceLabel.toLowerCase()}.`);
    const unresolved = lines.filter((l) => needsStore(l, fulfillmentLocationId) && !sources[l.lineId]);
    if (unresolved.length > 0) {
      return setMessage(`La bodega no alcanza para ${unresolved.map((l) => l.sku).join(", ")}: elige apartarla en la tienda o edita el pedido.`);
    }
    const viaStore = Object.keys(sources).length;
    const what = viaStore > 0 ? "Se apartará el stock (bodega y tienda), se generará el traslado tienda → bodega" : "Se apartará el stock en bodega";
    if (!window.confirm(`¿Confirmar el pago de ${formatCLP(quote.amount)} del pedido ${number}? ${what} y se registrará la venta.`)) return;
    startTransition(async () => {
      const res = await confirmPaymentAction({
        orderId,
        method,
        reference: reference.trim() || undefined,
        lineSources: Object.entries(sources).map(([lineId, locationId]) => ({ lineId, locationId })),
        idempotencyKey: key.current,
      });
      if (!res.ok) {
        // STOCK_INSUFICIENTE y compañía: nueva clave para el próximo intento y recarga de la disponibilidad mostrada.
        key.current = crypto.randomUUID();
        setMessage(res.message);
        router.refresh();
        return;
      }
      router.push(`/pedidos/${orderId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-soft">
      <fieldset className="space-y-2">
        <legend className="font-medium">Medio de pago</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {METHODS.map((m) => (
            <Button key={m.value} type="button" role="radio" aria-checked={method === m.value} variant={method === m.value ? "default" : "outline"} onClick={() => setMethod(m.value)}>
              {m.label}
            </Button>
          ))}
        </div>
      </fieldset>

      <LineSourcePicker lines={lines} fulfillmentLocationId={fulfillmentLocationId} value={sources} onChange={setSources} />

      {method !== "EFECTIVO" && (
        <div className="max-w-sm space-y-1">
          <Label htmlFor="pay-ref">{current.referenceLabel} *</Label>
          <Input id="pay-ref" autoComplete="off" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      )}

      <dl className="max-w-sm space-y-1 text-sm">
        <div className="flex justify-between">
          <dt>Total del pedido</dt>
          <dd className="tabular-nums">{formatCLP(total)}</dd>
        </div>
        {quote.roundingAdjustment !== 0 && (
          <div className="flex justify-between">
            <dt>Redondeo a $10 (efectivo)</dt>
            <dd className="tabular-nums">{formatCLP(quote.roundingAdjustment)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t pt-2 text-base font-semibold">
          <dt>Monto a recibir</dt>
          <dd className="tabular-nums" data-testid="amount-due">
            {formatCLP(quote.amount)}
          </dd>
        </div>
      </dl>

      {message && (
        <p role="alert" className={cn("rounded-2xl border border-tone-danger/30 bg-tone-danger-soft px-3 py-2 text-sm font-medium text-tone-danger")} data-testid="pay-error">
          {message}
        </p>
      )}

      <Button type="button" size="lg" className="h-11 px-4" onClick={confirm} disabled={pending}>
        {pending ? "Confirmando…" : "Confirmar pago"}
      </Button>
    </div>
  );
}
