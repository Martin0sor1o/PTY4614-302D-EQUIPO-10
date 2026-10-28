"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Minus, Plus, ScanBarcode, Trash2 } from "lucide-react";
import { formatCLP, parseCLP, percentToBps } from "@/lib/money";
import { changeFor, isDiscountOverLimit, priceSale, quotePayment, type PaymentMethodCode, type PosItem } from "@/modules/sales/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { createSaleAction, refreshItemsAction, searchItemsAction } from "@/app/(app)/pos/actions";
import { requestDiscountApprovalAction, type ApprovalLite } from "@/app/(app)/pos/approvals-actions";
import { ApprovalWait } from "@/components/approvals/approval-wait";
import { Textarea } from "@/components/ui/textarea";

// Pantalla de venta. El navegador solo MUESTRA los cálculos (funciones puras de sales/client): el servidor recalcula
// precios, descuentos, redondeo y total, y valida el límite de descuento, la caja abierta y el stock.

interface CartLine {
  item: PosItem;
  qty: number;
  /** Texto del campo (permite escribir "7,5"). */
  discountPct: string;
}

const METHODS: { code: PaymentMethodCode; label: string }[] = [
  { code: "EFECTIVO", label: "Efectivo" },
  { code: "DEBITO", label: "Débito" },
  { code: "CREDITO", label: "Crédito" },
  { code: "TRANSFERENCIA", label: "Transferencia" },
];

const QUICK_CASH = [5_000, 10_000, 20_000, 50_000];

function discountBpsOf(pct: string): number {
  const n = Number(pct.trim().replace(",", "."));
  if (pct.trim() === "" || !Number.isFinite(n) || n < 0 || n > 100) return Number.NaN;
  return percentToBps(n);
}

function othersText(item: PosItem): string {
  return item.others.map((o) => `${o.name} (${o.available}${o.reserved > 0 ? `, ${o.reserved} reservada${o.reserved === 1 ? "" : "s"}` : ""})`).join(" · ");
}

export function PosTerminal({
  locationName,
  limitBps,
  isAdmin,
  demoPinHint,
}: {
  locationName: string;
  limitBps: number;
  isAdmin: boolean;
  /** DEMO: pista del PIN de Belén (solo con DEMO_MODE). */
  demoPinHint: string | null;
}) {
  const router = useRouter();
  const scanRef = useRef<HTMLInputElement>(null);
  const searchSeq = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const keyRef = useRef<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [blocked, setBlocked] = useState<PosItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethodCode>("EFECTIVO");
  const [received, setReceived] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedVariantId, setFailedVariantId] = useState<string | null>(null);
  // Aprobación de Belén para los descuentos de la vendedora (RF-AUT-01 a 05). Va ligada a ESTE carrito.
  const [approval, setApproval] = useState<ApprovalLite | null>(null);
  const [approvalSnapshot, setApprovalSnapshot] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const askKey = useRef<{ snapshot: string; key: string } | null>(null);

  const focusScan = useCallback(() => scanRef.current?.focus(), []);

  // Una clave por intento de venta: se conserva ante doble clic y se renueva si cambia el carrito o el pago.
  useEffect(() => {
    keyRef.current = null;
  }, [cart, method, received, reference]);

  // Búsqueda por nombre/SKU mientras se escribe (con pausa). Enter la resuelve al tiro (lector de códigos).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      const res = await searchItemsAction(q);
      if (seq !== searchSeq.current) return;
      if (res.ok) setResults(res.items);
      else setNotice(res.message);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  function addItem(item: PosItem) {
    setError(null);
    setFailedVariantId(null);
    setNotice(null);
    if (item.here.available <= 0) {
      setBlocked(item);
      return;
    }
    setBlocked(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.item.variantId === item.variantId);
      if (!existing) return [...prev, { item, qty: 1, discountPct: "0" }];
      if (existing.qty + 1 > item.here.available) {
        setNotice(`Solo hay ${item.here.available} disponible${item.here.available === 1 ? "" : "s"} de ${item.sku} en ${locationName}.`);
        return prev;
      }
      return prev.map((l) => (l.item.variantId === item.variantId ? { ...l, item, qty: l.qty + 1 } : l));
    });
    setQuery("");
    setResults([]);
    focusScan();
  }

  async function resolveScan(raw: string) {
    const q = raw.trim();
    if (!q) return;
    const res = await searchItemsAction(q);
    if (!res.ok) {
      setNotice(res.message);
      return;
    }
    const lower = q.toLowerCase();
    const exact = res.items.find((i) => i.barcode.toLowerCase() === lower || i.sku.toLowerCase() === lower);
    const pick = exact ?? (res.items.length === 1 ? res.items[0] : undefined);
    if (pick) {
      addItem(pick);
    } else if (res.items.length === 0) {
      setNotice(`No se encontró ninguna prenda para “${q}”.`);
    } else {
      setResults(res.items);
      setQuery(q);
      setNotice(`${res.items.length} prendas coinciden con “${q}”: elige una.`);
    }
  }

  function onScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const raw = e.currentTarget.value;
    searchSeq.current++; // descarta la búsqueda en curso
    setQuery("");
    setResults([]);
    // Cola: varios escaneos seguidos se procesan en orden.
    queue.current = queue.current.then(() => resolveScan(raw)).catch(() => undefined);
  }

  function setQty(variantId: string, qty: number) {
    setError(null);
    setFailedVariantId(null);
    setCart((prev) =>
      prev.flatMap((l) => {
        if (l.item.variantId !== variantId) return [l];
        if (qty <= 0) return [];
        const max = l.item.here.available;
        if (qty > max) {
          setNotice(`Solo hay ${max} disponible${max === 1 ? "" : "s"} de ${l.item.sku} en ${locationName}.`);
          return [{ ...l, qty: max }];
        }
        return [{ ...l, qty }];
      }),
    );
    focusScan();
  }

  const priced = useMemo(
    () =>
      priceSale(
        cart.map((l) => {
          const bps = discountBpsOf(l.discountPct);
          return { unitPrice: l.item.unitPrice, quantity: l.qty, discountBps: Number.isNaN(bps) ? 0 : bps };
        }),
      ),
    [cart],
  );
  const quote = quotePayment(priced.total, method);

  // Huella del carrito (prendas, cantidades y % de descuento). Si cambia después de pedir o recibir la aprobación, esa
  // aprobación ya no sirve (el servidor lo vuelve a comprobar con su propia huella).
  const cartSnapshot = useMemo(
    () =>
      JSON.stringify(
        cart.map((l) => [l.item.variantId, l.qty, discountBpsOf(l.discountPct)]).sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1)),
      ),
    [cart],
  );
  // La aprobación solo vale para el carrito con el que se pidió: si el carrito cambia, deja de estar activa (y si vuelve a
  // quedar igual, vuelve a valer). El servidor la vuelve a comprobar con su propia huella al confirmar la venta.
  const activeApproval = approval && approvalSnapshot === cartSnapshot ? approval : null;
  const staleApproval = approval !== null && activeApproval === null;
  const approved = activeApproval?.status === "APROBADA";
  const overLimitIdx = cart.flatMap((l, i) => {
    const bps = discountBpsOf(l.discountPct);
    return !isAdmin && !Number.isNaN(bps) && isDiscountOverLimit(bps, limitBps) ? [i] : [];
  });

  async function sendRequest() {
    if (reason.trim().length < 3) return setAskError("Escribe el motivo para Belén (ej. clienta frecuente).");
    setAsking(true);
    setAskError(null);
    // Una clave por carrito: cambiar el carrito es otra solicitud; repetir el clic con el mismo carrito, la misma.
    if (askKey.current?.snapshot !== cartSnapshot) askKey.current = { snapshot: cartSnapshot, key: crypto.randomUUID() };
    const res = await requestDiscountApprovalAction({
      lines: cart.map((l) => ({ variantId: l.item.variantId, qty: l.qty, discountBps: discountBpsOf(l.discountPct) })),
      reason: reason.trim(),
      idempotencyKey: askKey.current.key,
    });
    setAsking(false);
    if (!res.ok) return setAskError(res.message);
    setApproval(res.approval);
    setApprovalSnapshot(cartSnapshot);
    setAskOpen(false);
    setReason("");
  }
  const receivedAmount = parseCLP(received);
  const change = method === "EFECTIVO" && receivedAmount !== null && receivedAmount >= quote.amount ? changeFor(receivedAmount, quote.amount) : null;

  const lineIssues = cart.map((l) => {
    const bps = discountBpsOf(l.discountPct);
    if (Number.isNaN(bps)) return "Descuento inválido";
    // La vendedora no puede superar el límite sin aprobación; el ADMIN sí (queda en auditoría).
    if (!isAdmin && isDiscountOverLimit(bps, limitBps)) return approved ? null : "Requiere aprobación de Belén";
    if (l.qty > l.item.here.available) return `Solo hay ${l.item.here.available} disponible(s)`;
    return null;
  });

  const paymentIssue =
    method === "EFECTIVO"
      ? receivedAmount === null
        ? "Ingresa el monto recibido"
        : receivedAmount < quote.amount
          ? `Falta ${formatCLP(quote.amount - receivedAmount)}`
          : null
      : reference.trim() === ""
        ? method === "TRANSFERENCIA"
          ? "Ingresa la referencia de la transferencia"
          : "Ingresa el N° de voucher"
        : null;

  const canConfirm = cart.length > 0 && priced.total > 0 && lineIssues.every((i) => i === null) && paymentIssue === null && !submitting;

  async function confirm() {
    if (!canConfirm) return;
    setSubmitting(true);
    setError(null);
    setFailedVariantId(null);
    keyRef.current ??= crypto.randomUUID();
    const payload = {
      lines: cart.map((l) => ({ variantId: l.item.variantId, qty: l.qty, discountBps: discountBpsOf(l.discountPct) })),
      payment: method === "EFECTIVO" ? { method, cashReceived: receivedAmount ?? 0 } : { method, reference: reference.trim() },
      approvalId: approved ? activeApproval!.id : undefined,
      idempotencyKey: keyRef.current,
    };
    const res = await createSaleAction(payload);
    if (res.ok) {
      router.push(`/pos/ticket/${res.saleId}`); // se queda en "procesando" hasta que cargue el ticket
      return;
    }
    setError(res.message);
    setFailedVariantId(res.variantId ?? null);
    setSubmitting(false);
    if (res.code === "APROBACION_INVALIDA" || res.code === "APROBACION_REQUERIDA") {
      // La aprobación no sirvió (usada, vencida, otro carrito…): se descarta para no dejar la caja a medias.
      setApproval(null);
      setApprovalSnapshot(null);
    }
    if (res.code === "STOCK_INSUFICIENTE") {
      // La disponibilidad cambió: se actualizan las cantidades del carrito.
      const fresh = await refreshItemsAction(cart.map((l) => l.item.variantId));
      if (fresh.ok) {
        setCart((prev) => prev.map((l) => ({ ...l, item: fresh.items.find((i) => i.variantId === l.item.variantId) ?? l.item })));
      }
    }
    focusScan();
  }

  return (
    <div
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]"
      // Si el foco se pierde (clic en vacío), vuelve al campo de escaneo para el lector.
      onBlurCapture={() => setTimeout(() => document.activeElement === document.body && focusScan(), 0)}
    >
      <section className="space-y-3" aria-label="Carrito">
        <div className="relative">
          <ScanBarcode className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            ref={scanRef}
            autoFocus
            autoComplete="off"
            aria-label="Escanear código de barras o buscar por nombre o SKU"
            placeholder="Escanea el código de barras o busca por nombre / SKU…"
            className="h-12 pl-10 text-base md:text-base"
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              if (v.trim().length < 2) {
                searchSeq.current++; // descarta búsquedas en curso
                setResults([]);
              }
            }}
            onKeyDown={onScanKeyDown}
          />
          {results.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-80 w-full overflow-auto rounded-2xl border bg-card shadow-lg" role="listbox" aria-label="Resultados">
              {results.map((item) => (
                <li key={item.variantId} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addItem(item)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent"
                  >
                    <span>
                      <span className="font-medium">{item.productName}</span>{" "}
                      <span className="text-muted-foreground">
                        · {item.color} · {item.size}
                      </span>
                      <span className="block font-mono text-xs text-muted-foreground">{item.sku}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold tabular-nums">{formatCLP(item.unitPrice)}</span>
                      {item.here.available > 0 ? (
                        <StatusBadge tone="ok" className="px-1.5 py-0 leading-5">
                          {item.here.available} disp.
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="danger" className="px-1.5 py-0 leading-5">
                          Sin stock aquí
                        </StatusBadge>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div role="status" aria-live="polite">
          {notice && (
            <Notice tone="warn" className="py-2">
              {notice}
            </Notice>
          )}
        </div>

        {blocked && (
          <Notice tone="danger" role="alert" data-testid="no-stock-alert">
            <p className="font-semibold">
              <span>
                {blocked.productName} · {blocked.color} · talla {blocked.size} ({blocked.sku}): no hay disponible en {locationName}
                {blocked.here.reserved > 0 &&
                  ` (${blocked.here.reserved} unidad${blocked.here.reserved === 1 ? "" : "es"} reservada${blocked.here.reserved === 1 ? "" : "s"} para ${
                    blocked.reservedFor.length > 0
                      ? `${blocked.reservedFor.length === 1 ? "el pedido" : "los pedidos"} ${blocked.reservedFor.map((r) => r.orderNumber).join(", ")}`
                      : "pedidos"
                  })`}
                .
              </span>
            </p>
            <p className="mt-1">
              {blocked.others.length > 0
                ? `Hay en: ${othersText(blocked)}. Es solo consulta: no se puede vender desde otra ubicación.`
                : "Tampoco hay unidades en otras ubicaciones."}
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-2 bg-card" onClick={() => (setBlocked(null), focusScan())}>
              Entendido
            </Button>
          </Notice>
        )}

        <div className="overflow-hidden rounded-3xl border bg-card shadow-soft">
          {cart.length === 0 ? (
            <p className="px-4 py-12 text-center text-muted-foreground">El carrito está vacío. Escanea una prenda para empezar.</p>
          ) : (
            <ul className="divide-y" aria-label="Prendas del carrito">
              {cart.map((l, i) => {
                const p = priced.lines[i];
                const issue = lineIssues[i];
                const failed = failedVariantId === l.item.variantId;
                return (
                  <li key={l.item.variantId} className={cn("grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center", (issue || failed) && "bg-tone-danger-soft")}>
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {l.item.productName} <span className="font-normal text-muted-foreground">· {l.item.color} · talla {l.item.size}</span>
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {l.item.sku} · {formatCLP(l.item.unitPrice)} c/u · disp. {l.item.here.available}
                      </div>
                      {(issue || failed) && (
                        <div role="alert" className="flex items-center gap-1 text-sm font-semibold text-tone-danger">
                          <AlertTriangle className="size-4 shrink-0" aria-hidden />
                          {failed ? "Sin stock suficiente" : issue}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1" role="group" aria-label={`Cantidad de ${l.item.sku}`}>
                      <Button type="button" variant="outline" size="icon" aria-label="Quitar una unidad" onClick={() => setQty(l.item.variantId, l.qty - 1)}>
                        <Minus />
                      </Button>
                      <span className="w-8 text-center text-base font-semibold tabular-nums" aria-live="polite">
                        {l.qty}
                      </span>
                      <Button type="button" variant="outline" size="icon" aria-label="Agregar una unidad" onClick={() => setQty(l.item.variantId, l.qty + 1)}>
                        <Plus />
                      </Button>
                    </div>

                    <label className="flex items-center gap-1 text-sm">
                      <span className="text-muted-foreground">Dcto.</span>
                      <Input
                        inputMode="decimal"
                        aria-label={`Descuento en porcentaje de ${l.item.sku}`}
                        className="h-8 w-16 text-right"
                        value={l.discountPct}
                        onChange={(e) => {
                          setError(null);
                          setCart((prev) => prev.map((x) => (x.item.variantId === l.item.variantId ? { ...x, discountPct: e.target.value } : x)));
                        }}
                      />
                      <span aria-hidden>%</span>
                    </label>

                    <div className="flex items-center justify-end gap-2 sm:w-32">
                      <div className="text-right">
                        {p.discount > 0 && <div className="text-xs text-muted-foreground line-through tabular-nums">{formatCLP(p.gross)}</div>}
                        <div className="text-base font-semibold tabular-nums">{formatCLP(p.lineTotal)}</div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Quitar ${l.item.sku} del carrito`} onClick={() => setQty(l.item.variantId, 0)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {overLimitIdx.length > 0 && (
          <section aria-label="Aprobación de descuento" className="space-y-3 rounded-2xl border border-tone-warn/30 bg-tone-warn-soft/70 p-3" data-testid="approval-box">
            {staleApproval && (
              <p className="flex items-start gap-2 text-sm font-semibold text-tone-warn" role="status" data-testid="approval-stale">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>El carrito cambió: la solicitud o aprobación anterior ya no corresponde. Pide una nueva.</span>
              </p>
            )}
            {!activeApproval ? (
              !askOpen ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-tone-warn">Los descuentos los da solo Belén: pídele que apruebe el de este carrito.</p>
                  <Button type="button" onClick={() => setAskOpen(true)} data-testid="ask-approval">
                    Pedir aprobación a Belén
                  </Button>
                </div>
              ) : (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendRequest();
                  }}
                >
                  <p className="text-sm font-medium text-tone-warn">Solicitud de descuento para Belén</p>
                  <ul className="rounded-xl border bg-card px-3 py-2 text-sm" aria-label="Detalle del descuento">
                    {overLimitIdx.map((i) => (
                      <li key={cart[i].item.variantId} className="flex justify-between gap-3">
                        <span>
                          {cart[i].item.sku} ×{cart[i].qty} · {discountBpsOf(cart[i].discountPct) / 100} %
                        </span>
                        <span className="tabular-nums">−{formatCLP(priced.lines[i].discount)}</span>
                      </li>
                    ))}
                    <li className="mt-1 flex justify-between gap-3 border-t pt-1 font-medium">
                      <span>Descuento total</span>
                      <span className="tabular-nums">−{formatCLP(priced.discountTotal)}</span>
                    </li>
                  </ul>
                  <label className="block text-sm font-medium" htmlFor="approval-reason">
                    Motivo <span className="text-tone-danger">*</span>
                  </label>
                  <Textarea id="approval-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. clienta frecuente, prenda con detalle…" />
                  {askError && (
                    <Notice tone="danger" role="alert" className="py-2">
                      {askError}
                    </Notice>
                  )}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={asking} data-testid="send-approval">
                      {asking ? "Enviando…" : "Enviar solicitud"}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => (setAskOpen(false), setAskError(null))}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              )
            ) : (
              <ApprovalWait
                key={activeApproval.id}
                approval={activeApproval}
                onStatus={setApproval}
                onClose={() => {
                  setApproval(null);
                  setApprovalSnapshot(null);
                }}
                closeLabel={activeApproval.status === "PENDIENTE" ? "Cancelar espera" : "Entendido"}
                demoPinHint={demoPinHint}
              />
            )}
          </section>
        )}
        <p className="text-xs text-muted-foreground">
          {limitBps === 0
            ? `Los descuentos los da solo Belén${isAdmin ? " (como administradora puedes aplicarlos; los que superan el límite quedan registrados)" : ": cualquier descuento requiere su aprobación"}.`
            : `Descuento máximo por línea sin aprobación: ${limitBps / 100} %${isAdmin ? " (como administradora puedes superarlo; queda registrado)" : ""}.`}{" "}
          Precios con IVA incluido.
        </p>
      </section>

      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start" aria-label="Pago">
        <div className="space-y-2 rounded-2xl border bg-card p-4 shadow-soft">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatCLP(priced.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Descuentos</dt>
              <dd className="tabular-nums">{priced.discountTotal > 0 ? `-${formatCLP(priced.discountTotal)}` : formatCLP(0)}</dd>
            </div>
            {quote.roundingAdjustment !== 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Redondeo efectivo</dt>
                <dd className="tabular-nums">{quote.roundingAdjustment > 0 ? `+${formatCLP(quote.roundingAdjustment)}` : formatCLP(quote.roundingAdjustment)}</dd>
              </div>
            )}
          </dl>
          <div className="flex items-baseline justify-between border-t pt-2">
            <span className="text-sm font-medium">Total a cobrar</span>
            <span className="text-3xl font-bold tabular-nums" data-testid="total-to-charge">
              {formatCLP(quote.amount)}
            </span>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-soft">
          <div role="radiogroup" aria-label="Medio de pago" className="grid grid-cols-2 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.code}
                type="button"
                role="radio"
                aria-checked={method === m.code}
                onClick={() => {
                  setMethod(m.code);
                  setError(null);
                  focusScan();
                }}
                className={cn(
                  "h-10 rounded-full border text-sm font-semibold transition-colors max-md:h-11",
                  method === m.code ? "border-brand-black bg-brand-black text-brand-pink" : "border-input bg-card hover:bg-accent",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {method === "EFECTIVO" ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="received">
                Monto recibido
              </label>
              <Input
                id="received"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ej. 50000"
                className="h-11 text-lg md:text-lg"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" variant="outline" size="sm" disabled={priced.total <= 0} onClick={() => setReceived(String(quote.amount))}>
                  Exacto
                </Button>
                {QUICK_CASH.map((v) => (
                  <Button key={v} type="button" variant="outline" size="sm" onClick={() => setReceived(String(v))}>
                    {formatCLP(v)}
                  </Button>
                ))}
              </div>
              <div className="flex items-baseline justify-between rounded-xl bg-secondary px-3 py-2">
                <span className="text-sm font-medium">Vuelto</span>
                <span className="text-xl font-bold tabular-nums" data-testid="change">
                  {change === null ? "—" : formatCLP(change)}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="reference">
                {method === "TRANSFERENCIA" ? "Referencia de la transferencia" : "N° de voucher"} <span className="text-tone-danger">*</span>
              </label>
              <Input id="reference" autoComplete="off" className="h-11 text-lg md:text-lg" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          )}
        </div>

        {error && (
          <Notice tone="danger" role="alert" className="py-2" data-testid="sale-error">
            {error}
          </Notice>
        )}

        <Button type="button" size="lg" className="h-14 w-full text-base font-semibold max-md:h-14" disabled={!canConfirm} onClick={confirm} data-testid="confirm-sale">
          {submitting ? (
            <>
              <Loader2 className="animate-spin" /> Procesando…
            </>
          ) : (
            <>Confirmar venta · {formatCLP(quote.amount)}</>
          )}
        </Button>
        {!canConfirm && !submitting && cart.length > 0 && (lineIssues.find(Boolean) ?? paymentIssue) && (
          <p className="text-center text-sm text-muted-foreground">{lineIssues.find(Boolean) ?? paymentIssue}</p>
        )}
      </aside>
    </div>
  );
}
