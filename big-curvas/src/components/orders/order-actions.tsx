"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelOrderAction, markDeliveredAction } from "@/app/(app)/pedidos/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Cancelar (con motivo, solo Belén). Muestra qué pasará según el estado antes de confirmar. */
export function CancelOrder({ orderId, number, consequence }: { orderId: string; number: string; consequence: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const key = useRef(crypto.randomUUID());

  function submit() {
    setMessage(null);
    if (reason.trim().length < 3) return setMessage("Escribe el motivo de la cancelación.");
    setConfirmOpen(true);
  }

  function execute() {
    startTransition(async () => {
      const res = await cancelOrderAction({ orderId, reason: reason.trim(), idempotencyKey: key.current });
      setConfirmOpen(false);
      if (!res.ok) return setMessage(res.message);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" className="border-tone-danger/30 text-tone-danger hover:bg-tone-danger-soft" onClick={() => setOpen(true)}>
        Cancelar pedido
      </Button>
    );
  }
  return (
    <div className="max-w-lg space-y-2 rounded-2xl border border-tone-danger/30 bg-tone-danger-soft/60 p-3">
      <Label htmlFor="cancel-reason">Motivo de la cancelación *</Label>
      <Textarea id="cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      <p className="text-xs text-muted-foreground">{consequence}</p>
      {message && (
        <p role="alert" className="text-sm font-medium text-tone-danger">
          {message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
          Volver
        </Button>
        <Button type="button" variant="danger" onClick={submit} disabled={pending}>
          {pending ? "Cancelando…" : "Confirmar cancelación"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Cancelar pedido"
        description={`¿Cancelar el pedido ${number}? ${consequence}`}
        confirmLabel="Sí, cancelar pedido"
        tone="danger"
        pending={pending}
        onConfirm={execute}
      />
    </div>
  );
}

/** ENTREGADO se marca a mano (sin integración con couriers en la demo). */
export function DeliverOrder({ orderId, number }: { orderId: string; number: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const key = useRef(crypto.randomUUID());

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const res = await markDeliveredAction({ orderId, idempotencyKey: key.current });
      setConfirmOpen(false);
      if (!res.ok) return setMessage(res.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <Button type="button" onClick={() => setConfirmOpen(true)} disabled={pending}>
        {pending ? "Guardando…" : "Marcar como entregado"}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Marcar como entregado"
        description={`¿Marcar el pedido ${number} como entregado?`}
        confirmLabel="Sí, marcar"
        pending={pending}
        onConfirm={submit}
      />
      {message && (
        <p role="alert" className="text-sm font-medium text-tone-danger">
          {message}
        </p>
      )}
    </div>
  );
}
