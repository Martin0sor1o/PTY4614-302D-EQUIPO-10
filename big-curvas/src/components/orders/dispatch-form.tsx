"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dispatchOrderAction } from "@/app/(app)/pedidos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Despacho solo por courier (lista en settings.couriers) con N° de seguimiento. */
export function DispatchForm({ orderId, couriers }: { orderId: string; couriers: string[] }) {
  const router = useRouter();
  const [courier, setCourier] = useState(couriers[0] ?? "");
  const [tracking, setTracking] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const key = useRef(crypto.randomUUID());

  function submit() {
    setMessage(null);
    if (!courier) return setMessage("Elige un courier.");
    if (tracking.trim().length < 3) return setMessage("Ingresa el N° de seguimiento.");
    startTransition(async () => {
      const res = await dispatchOrderAction({ orderId, courier, trackingNumber: tracking.trim(), idempotencyKey: key.current });
      if (!res.ok) return setMessage(res.message);
      router.push(`/pedidos/${orderId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <fieldset className="space-y-2">
        <legend className="font-medium">Courier</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {couriers.map((c) => (
            <Button key={c} type="button" role="radio" aria-checked={courier === c} variant={courier === c ? "default" : "outline"} onClick={() => setCourier(c)}>
              {c}
            </Button>
          ))}
        </div>
      </fieldset>
      <div className="max-w-sm space-y-1">
        <Label htmlFor="tracking">N° de seguimiento *</Label>
        <Input id="tracking" autoComplete="off" value={tracking} onChange={(e) => setTracking(e.target.value)} />
      </div>
      {message && (
        <p role="alert" className={cn("text-sm font-medium text-red-700")}>
          {message}
        </p>
      )}
      <Button type="button" size="lg" className="h-11 px-4" onClick={submit} disabled={pending}>
        {pending ? "Despachando…" : "Marcar como despachado"}
      </Button>
    </div>
  );
}
