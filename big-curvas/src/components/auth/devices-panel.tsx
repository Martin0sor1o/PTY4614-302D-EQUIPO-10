"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createPairingAction, revokeDeviceAction } from "@/app/(app)/ajustes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";

export interface StoreOption {
  id: string;
  name: string;
}

/** Vincular un equipo de caja: se elige la tienda y un nombre, y se muestra el código UNA vez. */
export function PairDevicePanel({ stores }: { stores: StoreOption[] }) {
  const [locationId, setLocationId] = useState(stores[0]?.id ?? "");
  const [name, setName] = useState("");
  const [issued, setIssued] = useState<{ code: string; expiresAt: string; deviceName: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setIssued(null);
    startTransition(async () => {
      const result = await createPairingAction({ locationId, name });
      if (!result.ok) return setMessage(result.message);
      setIssued({ code: result.code, expiresAt: result.expiresAt, deviceName: result.deviceName });
      setName("");
    });
  }

  if (stores.length === 0) return <p className="text-sm text-muted-foreground">No hay tiendas que vendan en el POS.</p>;

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="pair-location">Tienda</Label>
          <select
            id="pair-location"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="h-11 w-full rounded-xl border border-input bg-card px-3 text-base md:h-9 md:text-sm"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pair-name">Nombre del equipo</Label>
          <Input id="pair-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Caja Tienda Rancagua" maxLength={60} autoComplete="off" />
        </div>
        <Button type="submit" size="lg" className="h-11" disabled={pending || name.trim().length < 2}>
          {pending ? "Generando…" : "Generar código"}
        </Button>
      </form>
      {message && (
        <p role="alert" className="text-sm font-medium text-tone-danger">
          {message}
        </p>
      )}
      {issued && (
        <Notice tone="ok" title={`Código para «${issued.deviceName}»`} role="status">
          <p className="font-mono text-3xl font-bold tracking-widest" data-testid="pairing-code">
            {issued.code}
          </p>
          <p className="mt-1">
            Escríbelo en el equipo de la caja, en <strong>/vincular</strong>. Sirve una sola vez y vence a las{" "}
            {new Date(issued.expiresAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" })}. No se vuelve a mostrar.
          </p>
        </Notice>
      )}
    </div>
  );
}

/** Revocar un dispositivo: deja de servir y corta sus sesiones de caja al instante. */
export function RevokeDeviceButton({ deviceId, deviceName }: { deviceId: string; deviceName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function revoke() {
    setMessage(null);
    startTransition(async () => {
      const result = await revokeDeviceAction({ deviceId });
      if (!result.ok) setMessage(result.message);
      setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)} aria-label={`Revocar ${deviceName}`}>
        Revocar
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label={`Confirmar revocar ${deviceName}`}>
      <span className="text-sm">¿Revocar «{deviceName}»?</span>
      <Button type="button" variant="danger" size="sm" onClick={revoke} disabled={pending}>
        {pending ? "Revocando…" : "Sí, revocar"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
        No
      </Button>
      {message && (
        <span role="alert" className="text-sm font-medium text-tone-danger">
          {message}
        </span>
      )}
    </span>
  );
}
