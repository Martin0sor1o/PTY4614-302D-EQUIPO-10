"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { listReloginOperatorsAction, pinReloginAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";

interface Operator {
  id: string;
  name: string;
}

/**
 * La sesión de caja venció (60 min sin actividad o 12 h de turno) con una venta a medias. En vez de mandar a la
 * pantalla de login —y perder el carrito— se pide el PIN aquí mismo: el carrito sigue en la pantalla y, al volver a
 * entrar, el cobro se reintenta con el mismo carrito.
 */
export function PosRelogin({ onDone }: { onDone: (userId: string) => void }) {
  const [operators, setOperators] = useState<Operator[] | null>(null);
  const [userId, setUserId] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void listReloginOperatorsAction().then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setMessage(res.message);
        setOperators([]);
        return;
      }
      setOperators(res.operators);
      if (res.operators.length === 1) setUserId(res.operators[0].id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!userId) return setMessage("Elige tu nombre.");
    setMessage(null);
    startTransition(async () => {
      const res = await pinReloginAction({ userId, pin });
      if (res.ok) return onDone(userId);
      setMessage(res.message);
      setPin("");
    });
  }

  return (
    <Notice tone="warn" title="Tu sesión de caja venció" role="alert" data-testid="pos-relogin">
      <p>Tu carrito sigue aquí. Ingresa tu PIN para continuar con la venta.</p>
      {operators === null ? (
        <p className="mt-2">Cargando…</p>
      ) : operators.length === 0 ? (
        <p className="mt-2 font-medium">{message ?? "No hay vendedoras con PIN en este equipo."}</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-3 space-y-3 text-foreground">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="¿Quién eres?">
            {operators.map((o) => (
              <Button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={userId === o.id}
                variant={userId === o.id ? "default" : "outline"}
                onClick={() => setUserId(o.id)}
              >
                {o.name}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="relogin-pin">PIN (6 dígitos)</Label>
              <Input
                id="relogin-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className={cn("h-11 w-40 text-center text-lg tracking-[0.4em]")}
              />
            </div>
            <Button type="submit" size="lg" className="h-11" disabled={pending || pin.length < 6 || !userId}>
              {pending ? "Entrando…" : "Continuar"}
            </Button>
          </div>
          {message && (
            <p role="alert" className="text-sm font-medium text-tone-danger">
              {message}
            </p>
          )}
        </form>
      )}
    </Notice>
  );
}
