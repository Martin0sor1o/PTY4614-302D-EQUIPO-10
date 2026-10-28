"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { refundOrderAction } from "@/app/(app)/pedidos/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCLP } from "@/lib/money";

// El medio de reembolso sigue pendiente de negocio (P-17): se registra lo que Belén indique, sin reglas extra.
// Los botones solo ayudan a escribirlo; el campo es libre.
const SUGGESTIONS = ["Transferencia", "Efectivo", "Anulación en la máquina"];

/** Registro del reembolso de un pedido cancelado y pagado. Belén lo hace directamente: no necesita solicitud. */
export function RefundOrder({ orderId, number, saleNumber, amount }: { orderId: string; number: string; saleNumber: string; amount: number }) {
  const router = useRouter();
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const key = useRef(crypto.randomUUID());

  function submit() {
    setMessage(null);
    if (method.trim().length < 2) return setMessage("Indica el medio del reembolso.");
    setConfirmOpen(true);
  }

  function execute() {
    startTransition(async () => {
      const res = await refundOrderAction({ orderId, method: method.trim(), reference: reference.trim() || undefined, idempotencyKey: key.current });
      setConfirmOpen(false);
      if (!res.ok) {
        key.current = crypto.randomUUID();
        return setMessage(res.message);
      }
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-2xl border border-tone-danger/30 bg-tone-danger-soft p-4" aria-labelledby="sec-reembolso" data-testid="refund-pending">
      <h2 id="sec-reembolso" className="flex items-center gap-2 text-lg font-bold text-tone-danger">
        <AlertTriangle className="size-4" aria-hidden /> Reembolso pendiente · {formatCLP(amount)}
      </h2>
      <p className="text-sm text-tone-danger">
        El pedido se canceló después de pagar y el dinero no se ha devuelto. Cuando lo devuelvas, regístralo aquí: la venta {saleNumber} pasa a anulada. Lo haces tú
        directamente, sin solicitud de aprobación; queda en el registro de auditoría.
      </p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <Button key={s} type="button" size="sm" variant={method === s ? "default" : "outline"} onClick={() => setMethod(s)}>
            {s}
          </Button>
        ))}
      </div>
      <div className="grid max-w-xl gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="refund-method">Medio del reembolso *</Label>
          <Input id="refund-method" autoComplete="off" value={method} onChange={(e) => setMethod(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="refund-ref">Referencia</Label>
          <Input id="refund-ref" autoComplete="off" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° de transferencia, etc." />
        </div>
      </div>
      {message && (
        <p role="alert" className="text-sm font-medium text-tone-danger">
          {message}
        </p>
      )}
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "Registrando…" : "Registrar reembolso"}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Registrar reembolso"
        description={`¿Registrar el reembolso de ${formatCLP(amount)} del pedido ${number}? La venta ${saleNumber} pasará a anulada.`}
        confirmLabel="Sí, registrar"
        pending={pending}
        onConfirm={execute}
      />
    </section>
  );
}
