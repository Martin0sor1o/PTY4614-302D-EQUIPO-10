"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { sendTransferAction } from "@/app/(app)/traslados/actions";
import { Button } from "@/components/ui/button";

/** Enviar: baja el stock del origen. La clave se conserva entre reintentos para que no se envíe dos veces. */
export function SendTransferButton({ transferId, number, fromName, units }: { transferId: string; number: string; fromName: string; units: number }) {
  const router = useRouter();
  const key = useRef(crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send() {
    if (!window.confirm(`¿Enviar ${number}? Se descontarán ${units} unidad${units === 1 ? "" : "es"} del stock de ${fromName}.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await sendTransferAction({ transferId, idempotencyKey: key.current });
      if (!res.ok) return setError(res.message);
      router.push(`/traslados/${transferId}/guia`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <Button type="button" size="lg" className="h-11 px-4" onClick={send} disabled={pending}>
        <Send /> {pending ? "Enviando…" : "Enviar traslado"}
      </Button>
      {error && (
        <p role="alert" className="max-w-sm text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
