"use client";

import { useActionState, useState } from "react";
import { closeCashAction, openCashAction, type FormState } from "@/app/(app)/pos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function OpenCashForm({ locationName }: { locationName: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(openCashAction, undefined);
  const [amount, setAmount] = useState("");
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="openingCash" className="text-sm font-medium">
          Monto inicial en caja ({locationName})
        </label>
        <Input
          id="openingCash"
          name="openingCash"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="Ej. 50000"
          className="h-11 text-lg md:text-lg"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={state?.message ? true : undefined}
        />
        <p className="text-xs text-muted-foreground">Efectivo con el que parte la caja (fondo para vueltos). Puede ser $0.</p>
      </div>
      {state?.message && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={pending}>
        {pending ? "Abriendo…" : "Abrir caja"}
      </Button>
    </form>
  );
}

export function CloseCashForm({ locationName }: { locationName: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(closeCashAction, undefined);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="countedCash" className="text-sm font-medium">
          Efectivo contado en {locationName}
        </label>
        <Input
          id="countedCash"
          name="countedCash"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Ej. 85000"
          className="h-11 text-lg md:text-lg"
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Cuenta todo el efectivo de la caja, incluido el fondo inicial. Al cerrar verás la diferencia.</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="notes" className="text-sm font-medium">
          Observación {state?.needsNotes ? <span className="text-red-700">(obligatoria)</span> : <span className="font-normal text-muted-foreground">(obligatoria si hay diferencia)</span>}
        </label>
        <Textarea
          id="notes"
          name="notes"
          rows={2}
          maxLength={500}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          aria-invalid={state?.needsNotes ? true : undefined}
        />
      </div>
      {state?.message && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={pending}>
        {pending ? "Cerrando…" : "Cerrar caja"}
      </Button>
    </form>
  );
}
