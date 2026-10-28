"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { resetDemoDataAction } from "@/app/(app)/demo-actions";
import { Button } from "@/components/ui/button";

/** Botón "Reiniciar datos de demo" con confirmación en dos pasos. Solo se muestra a la administradora en DEMO_MODE. */
export function ResetDemoButton() {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setError(null);
    startTransition(async () => {
      const result = await resetDemoDataAction(); // si sale bien, redirige a /login
      if (result && !result.ok) {
        setError(result.message);
        setConfirming(false);
      }
    });
  }

  if (!confirming && !pending) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="outline" onClick={() => setConfirming(true)} data-testid="reset-demo">
          <RotateCcw aria-hidden /> Reiniciar datos de demo
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div role="alertdialog" aria-labelledby="reset-title" className="space-y-3 rounded-xl border border-tone-warn/30 bg-tone-warn-soft p-4 text-sm text-tone-warn">
      <p id="reset-title" className="font-medium">
        ¿Volver los datos de demo al inicio?
      </p>
      <p>Se borra todo lo que hiciste (ventas, pedidos, traslados, aprobaciones) y se vuelve a cargar el ejemplo con su historial. Tendrás que entrar de nuevo.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={reset} disabled={pending} data-testid="reset-demo-confirm">
          {pending ? "Reiniciando… puede tardar unos segundos" : "Sí, reiniciar"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
