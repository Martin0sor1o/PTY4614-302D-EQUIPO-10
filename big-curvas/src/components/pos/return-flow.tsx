"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Search, Trash2 } from "lucide-react";
import { formatCLP, parseCLP } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { quotePayment, type PosItem } from "@/modules/sales/client";
import { RETURN_REASONS, RETURN_REASON_LABEL, type MoneyRefundMethod, type ReturnCondition, type ReturnQuote } from "@/modules/returns/client";
import { refreshItemsAction, searchItemsAction } from "@/app/(app)/pos/actions";
import { UnconfirmedPanel } from "@/components/attempts/unconfirmed-panel";
import { useAttempt } from "@/components/attempts/use-attempt";
import type { AttemptSummary } from "@/lib/pending-attempt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Assumption } from "@/components/ui/assumption";
import { ApprovalWait } from "@/components/approvals/approval-wait";
import { PosRelogin } from "@/components/pos/pos-relogin";
import type { ApprovalLite } from "@/app/(app)/pos/approvals-actions";
import {
  checkReturnAttemptAction,
  createReturnAction,
  getReturnSaleAction,
  quoteReturnAction,
  requestReturnApprovalAction,
  searchReturnSalesAction,
  type ReturnSaleHitLite,
  type ReturnableSaleLite,
} from "@/app/(app)/pos/devoluciones/actions";
import { paidWithText } from "@/modules/returns/client";

// Flujo "Cambio / Devolución" (RF-DEV-01 a 07): buscar la venta → elegir prendas → motivo → destino (vale, dinero o cambio) →
// confirmar. El navegador solo MUESTRA lo que cotiza el servidor (quoteReturnAction); el servidor recalcula todo al confirmar.
// El estado se guarda en sessionStorage: si la sesión de caja vence a medias, se pide el PIN aquí mismo y no se pierde nada.

type Kind = "VALE" | "DINERO" | "CAMBIO";
type PayMethod = "EFECTIVO" | "DEBITO" | "CREDITO" | "TRANSFERENCIA";
/** Lo que se envía al confirmar (la clave la agrega el envío pendiente). */
interface ReturnPayload {
  saleId: string;
  lines: { saleLineId: string; qty: number; condition: ReturnCondition }[];
  reason: string;
  reasonNote?: string;
  resolution:
    | { kind: "VALE" }
    | { kind: "DINERO"; method: MoneyRefundMethod; reference?: string }
    | {
        kind: "CAMBIO";
        newLines: { variantId: string; qty: number }[];
        payment?: { method: "EFECTIVO"; cashReceived: number } | { method: Exclude<PayMethod, "EFECTIVO">; reference: string };
      };
  approvalId?: string;
}

interface PickedLine {
  qty: number;
  condition: ReturnCondition;
}
interface NewLine {
  item: PosItem;
  qty: number;
}

const METHOD_LABEL: Record<MoneyRefundMethod, string> = { EFECTIVO: "Efectivo", ANULACION_TRANSBANK: "Anulación en la máquina", TRANSFERENCIA: "Transferencia" };
const PAY_LABEL: Record<PayMethod, string> = { EFECTIVO: "Efectivo", DEBITO: "Débito", CREDITO: "Crédito", TRANSFERENCIA: "Transferencia" };
const selectClass = "h-11 w-full rounded-xl border border-input bg-card px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm";

export function ReturnFlow({ userId, locationName, isStore, demoPinHint }: { userId: string; locationName: string; isStore: boolean; demoPinHint: string | null }) {
  const router = useRouter();
  const searchSeq = useRef(0);
  const quoteSeq = useRef(0);
  const askKey = useRef<{ snapshot: string; key: string } | null>(null);
  const itemSeq = useRef(0);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ReturnSaleHitLite[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [sale, setSale] = useState<ReturnableSaleLite | null>(null);
  const [picks, setPicks] = useState<Record<string, PickedLine>>({});
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<Kind>("VALE");
  const [moneyMethod, setMoneyMethod] = useState<MoneyRefundMethod>("EFECTIVO");
  const [reference, setReference] = useState("");
  const [newLines, setNewLines] = useState<NewLine[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState<PosItem[]>([]);
  const [payMethod, setPayMethod] = useState<PayMethod>("DEBITO");
  const [received, setReceived] = useState("");
  const [payRef, setPayRef] = useState("");
  const [quote, setQuote] = useState<ReturnQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [approval, setApproval] = useState<ApprovalLite | null>(null);
  const [approvalSnapshot, setApprovalSnapshot] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [restored, setRestored] = useState(false);
  // Tras reingresar con PIN puede haber otra persona en la caja.
  const [reloggedAs, setReloggedAs] = useState<string | null>(null);
  const operatorId = reloggedAs ?? userId;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const storageKey = `bc-pos-return:${locationName}`;

  // La clave y el envío exacto se guardan antes de enviar. Si no llega la respuesta, la pantalla queda "sin confirmar".
  const { controller: attempt, view: pending } = useAttempt<ReturnPayload>({
    slot: `devolucion:${locationName}`,
    send: async (payload, idempotencyKey, retryOfUserId) => {
      const res = await createReturnAction({ ...payload, idempotencyKey, retryOfUserId });
      return res.ok ? { ok: true, id: res.returnId, number: res.number } : res;
    },
    lookup: (idempotencyKey) => checkReturnAttemptAction(idempotencyKey),
    onDone: ({ id }) => {
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // sin sessionStorage
      }
      router.push(`/pos/devoluciones/${id}`);
    },
  });
  const submitting = pending.phase === "enviando" || pending.phase === "registrada";
  const selected = useMemo(() => Object.entries(picks).filter(([, p]) => p.qty > 0), [picks]);

  // Lo que se cotiza y se aprueba: la venta, las prendas (con cantidad y condición), el destino y las prendas nuevas.
  const snapshot = useMemo(
    () =>
      JSON.stringify([
        sale?.id,
        selected.map(([id, p]) => [id, p.qty, p.condition]).sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1)),
        kind,
        kind === "DINERO" ? moneyMethod : null,
        kind === "CAMBIO" ? newLines.map((l) => [l.item.variantId, l.qty]).sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1)) : null,
      ]),
    [sale?.id, selected, kind, moneyMethod, newLines],
  );

  // ── Persistencia: si la sesión de caja vence y la pantalla se recarga, se reconstruye ──
  useEffect(() => {
    if (!restored || pending.phase === "registrada") return;
    try {
      if (!sale) sessionStorage.removeItem(storageKey);
      else
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({ saleId: sale.id, picks, reason, note, kind, moneyMethod, reference, newLines: newLines.map((l) => ({ v: l.item.variantId, q: l.qty })) }),
        );
    } catch {
      // sin sessionStorage: el estado sigue en memoria
    }
  }, [restored, sale, picks, reason, note, kind, moneyMethod, reference, newLines, storageKey, pending.phase]);

  const restore = useCallback(async () => {
    let saved: { saleId?: string; picks?: Record<string, PickedLine>; reason?: string; note?: string; kind?: Kind; moneyMethod?: MoneyRefundMethod; reference?: string; newLines?: { v: string; q: number }[] } | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    } catch {
      saved = null;
    }
    if (!saved?.saleId) return setRestored(true);
    const res = await getReturnSaleAction(saved.saleId);
    if (!res.ok) {
      if (res.code === "UNAUTHENTICATED") return setSessionExpired(true);
      return setRestored(true);
    }
    setSale(res.sale);
    setPicks(saved.picks ?? {});
    setReason(saved.reason ?? "");
    setNote(saved.note ?? "");
    setKind(saved.kind ?? "VALE");
    setMoneyMethod(saved.moneyMethod ?? res.sale.suggestedRefundMethod);
    setReference(saved.reference ?? "");
    if (saved.newLines?.length) {
      const fresh = await refreshItemsAction(saved.newLines.map((l) => l.v));
      if (fresh.ok) setNewLines(saved.newLines.flatMap((l) => (fresh.items.find((i) => i.variantId === l.v) ? [{ item: fresh.items.find((i) => i.variantId === l.v)!, qty: l.q }] : [])));
    }
    setRestored(true);
  }, [storageKey]);
  useEffect(() => {
    const t = setTimeout(() => void restore(), 0);
    return () => clearTimeout(t);
  }, [restore]);

  // ── Cotización (el servidor calcula; esto solo muestra) ──
  useEffect(() => {
    if (!sale || selected.length === 0 || (kind === "CAMBIO" && newLines.length === 0)) {
      const t = setTimeout(() => {
        setQuote(null);
        setQuoteError(null);
      }, 0);
      return () => clearTimeout(t);
    }
    const seq = ++quoteSeq.current;
    const t = setTimeout(async () => {
      setQuoting(true);
      const res = await quoteReturnAction({
        saleId: sale.id,
        lines: selected.map(([saleLineId, p]) => ({ saleLineId, qty: p.qty, condition: p.condition })),
        resolution:
          kind === "VALE"
            ? { kind: "VALE" }
            : kind === "DINERO"
              ? { kind: "DINERO", method: moneyMethod, reference: "pendiente" } // el N° no cambia la cotización; se exige al confirmar
              : { kind: "CAMBIO", newLines: newLines.map((l) => ({ variantId: l.item.variantId, qty: l.qty })) },
      });
      if (seq !== quoteSeq.current) return;
      setQuoting(false);
      if (res.ok) {
        setQuote(res.quote);
        setQuoteError(null);
      } else if (res.code === "UNAUTHENTICATED") setSessionExpired(true);
      else {
        setQuote(null);
        setQuoteError(res.message);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [sale, selected, kind, moneyMethod, newLines]);

  // ── Búsqueda de la venta ──
  async function search(text = query) {
    const seq = ++searchSeq.current;
    setSearching(true);
    setError(null);
    const res = await searchReturnSalesAction(text);
    if (seq !== searchSeq.current) return;
    setSearching(false);
    if (res.ok) setHits(res.sales);
    else if (res.code === "UNAUTHENTICATED") setSessionExpired(true);
    else setError(res.message);
  }
  useEffect(() => {
    const t = setTimeout(() => void search(""), 0);
    return () => clearTimeout(t);
    // solo al abrir: las ventas recientes de la tienda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openSale(id: string) {
    setError(null);
    const res = await getReturnSaleAction(id);
    if (!res.ok) {
      if (res.code === "UNAUTHENTICATED") return setSessionExpired(true);
      return setError(res.message);
    }
    setSale(res.sale);
    setPicks({});
    setReason("");
    setNote("");
    setKind("VALE");
    setMoneyMethod(res.sale.suggestedRefundMethod);
    setReference("");
    setNewLines([]);
    setApproval(null);
    setApprovalSnapshot(null);
  }

  function reset() {
    setSale(null);
    setPicks({});
    setQuote(null);
    setApproval(null);
    setApprovalSnapshot(null);
    setError(null);
  }

  // ── Prendas nuevas del cambio ──
  useEffect(() => {
    const q = itemQuery.trim();
    if (q.length < 2) return;
    const seq = ++itemSeq.current;
    const t = setTimeout(async () => {
      const res = await searchItemsAction(q);
      if (seq !== itemSeq.current) return;
      if (res.ok) setItemResults(res.items);
      else if (res.code === "UNAUTHENTICATED") setSessionExpired(true);
    }, 250);
    return () => clearTimeout(t);
  }, [itemQuery]);

  function addNew(item: PosItem) {
    setNewLines((prev) => {
      const i = prev.findIndex((l) => l.item.variantId === item.variantId);
      if (i >= 0) return prev.map((l, k) => (k === i ? { ...l, qty: Math.min(l.qty + 1, item.here.available) } : l));
      return [...prev, { item, qty: 1 }];
    });
    setItemQuery("");
    setItemResults([]);
  }

  // ── Aprobación de Belén ──
  const activeApproval = approval && approvalSnapshot === snapshot ? approval : null;
  const staleApproval = approval !== null && activeApproval === null;
  const approved = activeApproval?.status === "APROBADA";
  const needsApproval = quote?.approval.required === true;

  const noteOk = reason !== "OTRO" || note.trim().length >= 3;

  async function sendApproval() {
    if (!sale || !quote || !reason) return;
    if (!noteOk) return setAskError("Cuenta brevemente el motivo.");
    setAsking(true);
    setAskError(null);
    if (askKey.current?.snapshot !== snapshot) askKey.current = { snapshot, key: crypto.randomUUID() };
    const res = await requestReturnApprovalAction({
      saleId: sale.id,
      lines: selected.map(([saleLineId, p]) => ({ saleLineId, qty: p.qty, condition: p.condition })),
      resolution: resolutionPayload(),
      reason,
      reasonNote: note.trim() || undefined,
      idempotencyKey: askKey.current.key,
    });
    setAsking(false);
    if (!res.ok) {
      if (res.code === "UNAUTHENTICATED") setSessionExpired(true);
      return setAskError(res.message);
    }
    setApproval(res.approval);
    setApprovalSnapshot(snapshot);
    setAskOpen(false);
  }

  function resolutionPayload(): ReturnPayload["resolution"] {
    if (kind === "VALE") return { kind: "VALE" as const };
    if (kind === "DINERO") return { kind: "DINERO" as const, method: moneyMethod, reference: reference.trim() || undefined };
    const toPay = quote?.exchange?.toPay ?? 0;
    return {
      kind: "CAMBIO" as const,
      newLines: newLines.map((l) => ({ variantId: l.item.variantId, qty: l.qty })),
      payment:
        toPay > 0
          ? payMethod === "EFECTIVO"
            ? { method: "EFECTIVO" as const, cashReceived: parseCLP(received) ?? 0 }
            : { method: payMethod, reference: payRef.trim() }
          : undefined,
    };
  }

  // ── Validaciones para habilitar "Confirmar" ──
  const toPay = quote?.exchange?.toPay ?? 0;
  const payQuote = toPay > 0 ? quotePayment(toPay, payMethod) : null;
  const receivedAmount = parseCLP(received);
  const payIssue =
    toPay <= 0
      ? null
      : payMethod === "EFECTIVO"
        ? receivedAmount === null
          ? "Ingresa el monto recibido"
          : payQuote && receivedAmount < payQuote.amount
            ? `Falta ${formatCLP(payQuote.amount - receivedAmount)}`
            : null
        : payRef.trim() === ""
          ? payMethod === "TRANSFERENCIA"
            ? "Ingresa la referencia de la transferencia"
            : "Ingresa el N° de voucher"
          : null;
  const issue =
    !sale || selected.length === 0
      ? "Elige las prendas que se devuelven"
      : !reason
        ? "Elige el motivo"
        : !noteOk
          ? "Cuenta brevemente el motivo"
          : kind === "DINERO" && moneyMethod !== "EFECTIVO" && reference.trim() === ""
            ? moneyMethod === "TRANSFERENCIA"
              ? "Escribe el N° de la transferencia"
              : "Escribe el N° de la anulación en la máquina"
            : kind === "CAMBIO" && newLines.length === 0
              ? "Elige la prenda nueva"
            : !quote
              ? (quoteError ?? "Calculando…")
              : quote.warnings.some((w) => /No hay caja abierta/.test(w))
                ? "Abre la caja para continuar"
                : payIssue
                  ? payIssue
                  : needsApproval && !approved
                    ? "Falta la aprobación de Belén"
                    : null;
  const canConfirm = issue === null && pending.phase === "libre" && !quoting;

  /** Lo que se muestra del envío si queda sin confirmar. */
  function returnSummary(current: ReturnableSaleLite, q: ReturnQuote): AttemptSummary {
    const lines = [
      `Venta original ${current.number}`,
      ...q.lines.map((l) => `Devuelve: ${l.productName} × ${l.qty}${l.condition === "DANADA" ? " (dañada)" : ""}`),
      ...(kind === "CAMBIO" ? newLines.map((l) => `Lleva: ${l.item.productName} · ${l.item.color} · talla ${l.item.size} × ${l.qty}`) : []),
    ];
    if (kind === "VALE") return { operation: "devolucion", lines, payment: "Se emite un vale", amountLabel: "Valor del vale", amount: q.voucherAmount };
    if (kind === "DINERO") {
      const number = moneyMethod !== "EFECTIVO" ? ` · N° ${reference.trim()}` : "";
      return {
        operation: "devolucion",
        lines,
        payment: `Reembolso: ${METHOD_LABEL[moneyMethod].toLowerCase()}${number}`,
        amountLabel: "Monto a devolver",
        amount: q.refund?.amount ?? q.valueReturned,
      };
    }
    const paid =
      payMethod === "EFECTIVO"
        ? `recibido ${formatCLP(receivedAmount ?? 0)}`
        : `${payMethod === "TRANSFERENCIA" ? "referencia" : "N° de voucher"} ${payRef.trim()}`;
    return {
      operation: "cambio",
      lines,
      payment: toPay > 0 ? `Diferencia: ${PAY_LABEL[payMethod]} · ${paid}` : "Sin pago adicional",
      amountLabel: toPay > 0 ? "La clienta paga" : "Valor devuelto",
      amount: toPay > 0 ? (payQuote?.amount ?? toPay) : q.valueReturned,
    };
  }

  async function confirm() {
    if (!canConfirm || !sale || !quote) return;
    setError(null);
    const payload: ReturnPayload = {
      saleId: sale.id,
      lines: selected.map(([saleLineId, p]) => ({ saleLineId, qty: p.qty, condition: p.condition })),
      reason,
      reasonNote: note.trim() || undefined,
      resolution: resolutionPayload(),
      approvalId: needsApproval && approved ? activeApproval!.id : undefined,
    };
    // El contenido que define la clave: todo menos la aprobación, con las listas en orden fijo.
    const byId = (a: string, b: string) => (a < b ? -1 : 1);
    const content = {
      saleId: payload.saleId,
      lines: [...payload.lines].sort((a, b) => byId(a.saleLineId, b.saleLineId)),
      reason: payload.reason,
      reasonNote: payload.reasonNote,
      resolution:
        payload.resolution.kind === "CAMBIO"
          ? { ...payload.resolution, newLines: [...payload.resolution.newLines].sort((a, b) => byId(a.variantId, b.variantId)) }
          : payload.resolution,
    };
    const outcome = await attempt.submit({ content, payload, summary: returnSummary(sale, quote), userId: operatorId });
    if (outcome.status !== "rechazada") return;
    const res = outcome.result;
    if (res.code === "UNAUTHENTICATED") return setSessionExpired(true); // no se pierde nada: se pide el PIN y se reintenta con la misma clave
    setError(res.message);
    if (res.code === "APROBACION_INVALIDA" || res.code === "APROBACION_REQUERIDA") {
      setApproval(null);
      setApprovalSnapshot(null);
    }
  }

  const lineCount = selected.reduce((a, [, p]) => a + p.qty, 0);

  const relogin = sessionExpired && (
    <PosRelogin
      onDone={(who) => {
        setReloggedAs(who);
        setSessionExpired(false);
        setError(null);
        setNotice("Sesión renovada. Puedes continuar.");
        if (!restored) void restore();
      }}
    />
  );

  // Sin confirmar: no hay nada que editar hasta saber si la devolución quedó registrada.
  if (pending.phase === "en_duda" && pending.record?.summary) {
    const record = pending.record;
    return (
      <div className="space-y-3">
        {relogin}
        <UnconfirmedPanel
          summary={pending.record.summary}
          sentAt={record.sentAt}
          busy={pending.busy}
          message={pending.message}
          sameUser={record.userId === operatorId}
          voucherRemoved={record.voucherRemoved === true}
          onRetry={() => void attempt.retry(operatorId).then((r) => r.code === "UNAUTHENTICATED" && setSessionExpired(true))}
          onVerify={() => void attempt.verify().then((r) => r.code === "UNAUTHENTICATED" && setSessionExpired(true))}
        />
      </div>
    );
  }
  // El rechazo del primer envío puede llegar atrasado (después del aviso de los 30 segundos).
  const returnError = error ?? (pending.phase === "libre" ? pending.message : null);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]" inert={submitting}>
      <section className="space-y-4" aria-label="Devolución">
        {relogin}
        {notice && <Notice tone="info">{notice}</Notice>}

        {!sale ? (
          <div className="space-y-3 rounded-3xl border bg-card p-4 shadow-soft">
            <h2 className="text-lg font-bold">1 · Busca la venta original</h2>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
            >
              <Input
                autoFocus
                autoComplete="off"
                aria-label="N° de venta o de pedido"
                placeholder="N° de venta (ej. RGA-000012) o de pedido online"
                className="h-12 text-base"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button type="submit" size="lg" className="h-12 px-4" disabled={searching}>
                {searching ? <Loader2 className="animate-spin" /> : <Search />} Buscar
              </Button>
            </form>
            {error && <p role="alert" className="text-sm font-medium text-tone-danger">{error}</p>}
            {hits === null ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : hits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No se encontraron ventas. Prueba con otro número.</p>
            ) : (
              <ul className="divide-y rounded-2xl border" aria-label="Ventas">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => void openSale(h.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent">
                      <span>
                        <span className="font-mono font-semibold">{h.number}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(new Date(h.createdAt))} · {h.locationName}
                          {h.channel !== "POS" ? " · pedido online" : ""}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-semibold tabular-nums">{formatCLP(h.total)}</span>
                        <span className="text-xs text-muted-foreground">{h.returnableUnits > 0 ? `${h.returnableUnits} por devolver` : "ya devuelta"}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3 rounded-3xl border bg-card p-4 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold">
                    Venta <span className="font-mono">{sale.number}</span>
                    {sale.orderNumber ? ` · pedido ${sale.orderNumber}` : ""}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(new Date(sale.createdAt))} · {sale.locationName} · {paidWithText(sale.paymentMethods)}
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={reset}>
                  Cambiar venta
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {sale.outOfWindow ? (
                  <StatusBadge tone="warn">Fuera de plazo · {sale.daysSince} días (plazo {sale.windowDays})</StatusBadge>
                ) : (
                  <StatusBadge tone="ok">Dentro de plazo · {sale.daysSince} de {sale.windowDays} días</StatusBadge>
                )}
                <Assumption id="S-01" />
                {sale.paidWithVoucher && (
                  <>
                    <StatusBadge tone="info">Pagada con vale: solo vale o cambio</StatusBadge>
                    <Assumption id="S-07" />
                  </>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-3xl border bg-card p-4 shadow-soft">
              <h2 className="text-lg font-bold">
                2 · ¿Qué prendas devuelve? <Assumption id="S-03" />
              </h2>
              <ul className="divide-y">
                {sale.lines.map((l) => {
                  const p = picks[l.saleLineId] ?? { qty: 0, condition: "VENDIBLE" as const };
                  return (
                    <li key={l.saleLineId} className="flex flex-wrap items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {l.productName} <span className="text-muted-foreground">· {l.color} · T{l.size}</span>
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {l.sku} · vendidas {l.soldQty} · devueltas {l.returnedQty}
                        </p>
                      </div>
                      {l.returnableQty === 0 ? (
                        <StatusBadge tone="neutral">Ya devuelta</StatusBadge>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-1" role="group" aria-label={`Cantidad a devolver de ${l.sku}`}>
                            <Button type="button" variant="outline" size="icon" aria-label="Menos" disabled={p.qty <= 0} onClick={() => setPicks((s) => ({ ...s, [l.saleLineId]: { ...p, qty: p.qty - 1 } }))}>
                              <Minus />
                            </Button>
                            <span className="w-8 text-center font-semibold tabular-nums" data-testid={`qty-${l.sku}`}>{p.qty}</span>
                            <Button type="button" variant="outline" size="icon" aria-label="Más" disabled={p.qty >= l.returnableQty} onClick={() => setPicks((s) => ({ ...s, [l.saleLineId]: { ...p, qty: p.qty + 1 } }))}>
                              <Plus />
                            </Button>
                          </div>
                          <select
                            aria-label={`Estado de ${l.sku}`}
                            className={cn(selectClass, "w-44")}
                            disabled={p.qty === 0}
                            value={p.condition}
                            onChange={(e) => setPicks((s) => ({ ...s, [l.saleLineId]: { ...p, condition: e.target.value as ReturnCondition } }))}
                          >
                            <option value="VENDIBLE">Vendible</option>
                            <option value="DANADA">Dañada (merma)</option>
                          </select>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="space-y-3 rounded-3xl border bg-card p-4 shadow-soft">
              <h2 className="text-lg font-bold">
                3 · Motivo <Assumption id="S-09" />
              </h2>
              <select aria-label="Motivo de la devolución" className={selectClass} value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Elige el motivo…</option>
                {RETURN_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {RETURN_REASON_LABEL[r]}
                  </option>
                ))}
              </select>
              {(reason === "OTRO" || note) && (
                <Textarea aria-label="Cuenta brevemente el motivo" placeholder={reason === "OTRO" ? "Cuenta brevemente el motivo (obligatorio)" : "Nota (opcional)"} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
              )}
            </div>

            <div className="space-y-3 rounded-3xl border bg-card p-4 shadow-soft">
              <h2 className="text-lg font-bold">4 · ¿Cómo se le devuelve?</h2>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Destino de la devolución">
                <Choice active={kind === "VALE"} onClick={() => setKind("VALE")} title="Vale" hint="Saldo a favor en la tienda" assumption="S-08" />
                <Choice active={kind === "DINERO"} onClick={() => setKind("DINERO")} disabled={sale.paidWithVoucher} title="Reembolso" hint={sale.paidWithVoucher ? "No: la venta se pagó con vale" : "En dinero (con aprobación de Belén)"} assumption="S-06" />
                {isStore && <Choice active={kind === "CAMBIO"} onClick={() => setKind("CAMBIO")} title="Cambio" hint="Se lleva otra prenda" assumption="S-05" />}
              </div>

              {kind === "DINERO" && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium" htmlFor="money-method">
                    Medio del reembolso (el original es {METHOD_LABEL[sale.suggestedRefundMethod].toLowerCase()})
                  </label>
                  <select id="money-method" className={selectClass} value={moneyMethod} onChange={(e) => setMoneyMethod(e.target.value as MoneyRefundMethod)}>
                    {(Object.keys(METHOD_LABEL) as MoneyRefundMethod[])
                      .filter((m) => isStore || m !== "EFECTIVO")
                      .map((m) => (
                        <option key={m} value={m}>
                          {METHOD_LABEL[m]}
                          {m === sale.suggestedRefundMethod ? " (el original)" : ""}
                        </option>
                      ))}
                  </select>
                  {moneyMethod !== "EFECTIVO" && (
                    <Input aria-label="N° de la transferencia o de la anulación" placeholder={moneyMethod === "TRANSFERENCIA" ? "N° de la transferencia" : "N° de la anulación en la máquina"} value={reference} onChange={(e) => setReference(e.target.value)} />
                  )}
                  {quote?.warnings.some((w) => /sugerido es devolver|era /.test(w)) && (
                    <Notice tone="warn" title={moneyMethod === "EFECTIVO" ? "La venta no se pagó en efectivo" : "No es el medio original"} data-testid="refund-method-warning">
                      {quote.warnings.filter((w) => /sugerido es devolver|era /.test(w)).join(" ")}
                      {moneyMethod !== sale.suggestedRefundMethod && (
                        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setMoneyMethod(sale.suggestedRefundMethod)}>
                          Usar el medio original ({METHOD_LABEL[sale.suggestedRefundMethod].toLowerCase()})
                        </Button>
                      )}
                    </Notice>
                  )}
                </div>
              )}

              {kind === "CAMBIO" && (
                <div className="space-y-2">
                  <Input aria-label="Buscar la prenda nueva" autoComplete="off" placeholder="Busca la prenda nueva por nombre o SKU…" value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} />
                  {itemResults.length > 0 && (
                    <ul className="max-h-60 overflow-auto rounded-2xl border bg-card" role="listbox" aria-label="Resultados">
                      {itemResults.map((item) => (
                        <li key={item.variantId} role="option" aria-selected={false}>
                          <button type="button" disabled={item.here.available <= 0} onClick={() => addNew(item)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent disabled:opacity-50">
                            <span>
                              {item.productName} <span className="text-muted-foreground">· {item.color} · {item.size}</span>
                              <span className="block font-mono text-xs text-muted-foreground">{item.sku}</span>
                            </span>
                            <span className="text-right">
                              <span className="block font-semibold tabular-nums">{formatCLP(item.unitPrice)}</span>
                              <span className="text-xs">{item.here.available > 0 ? `${item.here.available} disp.` : "Sin stock aquí"}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <ul className="divide-y">
                    {newLines.map((l) => (
                      <li key={l.item.variantId} className="flex items-center justify-between gap-2 py-1.5">
                        <span>
                          {l.item.productName} <span className="text-muted-foreground">· {l.item.color} · {l.item.size}</span>
                          <span className="block font-mono text-xs text-muted-foreground">{l.item.sku}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Button type="button" variant="outline" size="icon" aria-label="Menos" disabled={l.qty <= 1} onClick={() => setNewLines((p) => p.map((x) => (x === l ? { ...x, qty: x.qty - 1 } : x)))}>
                            <Minus />
                          </Button>
                          <span className="w-7 text-center font-semibold tabular-nums">{l.qty}</span>
                          <Button type="button" variant="outline" size="icon" aria-label="Más" disabled={l.qty >= l.item.here.available} onClick={() => setNewLines((p) => p.map((x) => (x === l ? { ...x, qty: x.qty + 1 } : x)))}>
                            <Plus />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" aria-label="Quitar" onClick={() => setNewLines((p) => p.filter((x) => x !== l))}>
                            <Trash2 />
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {toPay > 0 && (
                    <div className="space-y-2 rounded-2xl border p-3">
                      <p className="text-sm font-medium">
                        La clienta paga la diferencia: <span className="font-bold">{formatCLP(payQuote?.amount ?? toPay)}</span>
                      </p>
                      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Medio de pago de la diferencia">
                        {(Object.keys(PAY_LABEL) as PayMethod[]).map((m) => (
                          <Button key={m} type="button" role="radio" aria-checked={payMethod === m} variant={payMethod === m ? "default" : "outline"} onClick={() => setPayMethod(m)}>
                            {PAY_LABEL[m]}
                          </Button>
                        ))}
                      </div>
                      {payMethod === "EFECTIVO" ? (
                        <Input aria-label="Monto recibido" inputMode="numeric" placeholder="Monto recibido" value={received} onChange={(e) => setReceived(e.target.value)} />
                      ) : (
                        <Input aria-label="Referencia del pago" placeholder={payMethod === "TRANSFERENCIA" ? "Referencia de la transferencia" : "N° de voucher"} value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start" aria-label="Resumen">
        <div className="space-y-3 rounded-3xl border bg-card p-4 shadow-soft">
          <h2 className="text-lg font-bold">Resumen</h2>
          {!sale || selected.length === 0 ? (
            <p className="text-sm text-muted-foreground">Elige una venta y las prendas que se devuelven.</p>
          ) : quote ? (
            <>
              <ul className="space-y-1 text-sm">
                {quote.lines.map((l) => (
                  <li key={l.saleLineId} className="flex justify-between gap-2">
                    <span>
                      {l.productName} ×{l.qty}
                      {l.condition === "DANADA" && <span className="text-tone-danger"> · dañada</span>}
                    </span>
                    <span className="tabular-nums">{formatCLP(l.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Valor devuelto <Assumption id="S-04" /></span>
                <span className="tabular-nums" data-testid="value-returned">{formatCLP(quote.valueReturned)}</span>
              </div>
              {quote.refund && (
                <p className="text-sm" data-testid="refund-line">
                  Se devuelve en <strong>{METHOD_LABEL[quote.refund.method].toLowerCase()}</strong>: {formatCLP(quote.refund.amount)}
                  {quote.refund.roundingAdjustment !== 0 && <span className="text-muted-foreground"> (redondeo a $10: {formatCLP(quote.refund.roundingAdjustment)})</span>}
                </p>
              )}
              {quote.resolution === "VALE" && <p className="text-sm">Se emite un vale por <strong>{formatCLP(quote.voucherAmount)}</strong>.</p>}
              {quote.exchange && (
                <div className="space-y-0.5 text-sm" data-testid="exchange-line">
                  <p>Prendas nuevas: <strong>{formatCLP(quote.exchange.newTotal)}</strong></p>
                  {quote.exchange.toPay > 0 && <p>La clienta paga: <strong>{formatCLP(quote.exchange.toPay)}</strong></p>}
                  {quote.exchange.leftover > 0 && <p>Saldo a favor en vale: <strong>{formatCLP(quote.exchange.leftover)}</strong></p>}
                  {quote.exchange.toPay === 0 && quote.exchange.leftover === 0 && <p>Sin diferencia.</p>}
                </div>
              )}
              {quote.warnings
                .filter((w) => !/sugerido es devolver|era /.test(w))
                .map((w) => (
                  <Notice key={w} tone="warn">{w}</Notice>
                ))}
              {quote.approval.required ? (
                <Notice tone="warn" title="Necesita la aprobación de Belén" data-testid="needs-approval">
                  {quote.approval.reasons.join(" · ")}
                </Notice>
              ) : quote.approval.type ? (
                <Notice tone="info" title="Belén opera directo">Quedará en la auditoría como hecha por Belén.</Notice>
              ) : null}
            </>
          ) : quoteError ? (
            <Notice tone="danger" role="alert">{quoteError}</Notice>
          ) : (
            <p className="text-sm text-muted-foreground">Calculando…</p>
          )}

          {needsApproval && (
            <div className="space-y-2">
              {staleApproval && <Notice tone="warn">Cambiaste algo después de pedir la aprobación: pide una nueva.</Notice>}
              {activeApproval ? (
                <ApprovalWait
                  approval={activeApproval}
                  onStatus={(a) => setApproval(a)}
                  onClose={() => {
                    setApproval(null);
                    setApprovalSnapshot(null);
                  }}
                  closeLabel="Pedir otra"
                  demoPinHint={demoPinHint}
                />
              ) : askOpen ? (
                <div className="space-y-2">
                  {askError && <p role="alert" className="text-sm font-medium text-tone-danger">{askError}</p>}
                  <p className="text-sm text-muted-foreground">Se le avisa a Belén con el motivo que elegiste.</p>
                  <div className="flex gap-2">
                    <Button type="button" disabled={asking || !reason || !noteOk} onClick={() => void sendApproval()}>
                      {asking ? <Loader2 className="animate-spin" /> : null} Enviar a Belén
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setAskOpen(false)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full" disabled={!quote || !reason || !noteOk} onClick={() => setAskOpen(true)}>
                  Pedir aprobación a Belén
                </Button>
              )}
            </div>
          )}

          {returnError && <Notice tone="danger" role="alert">{returnError}</Notice>}
          <Button type="button" size="lg" className="h-12 w-full text-base" disabled={!canConfirm} onClick={() => void confirm()}>
            {submitting ? <Loader2 className="animate-spin" /> : null}
            {submitting ? "Procesando…" : kind === "CAMBIO" ? "Confirmar cambio" : "Confirmar devolución"}
          </Button>
          {issue && !submitting && sale && <p className="text-center text-xs text-muted-foreground">{issue}</p>}
          {lineCount > 0 && <p className="text-center text-xs text-muted-foreground">{lineCount} {lineCount === 1 ? "prenda" : "prendas"} · {locationName}</p>}
        </div>
      </aside>
    </div>
  );
}

function Choice({ active, onClick, title, hint, assumption, disabled }: { active: boolean; onClick: () => void; title: string; hint: string; assumption: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn("rounded-2xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50", active ? "border-primary bg-primary/10 ring-2 ring-primary" : "hover:bg-accent")}
    >
      <span className="block font-semibold">
        {title} <Assumption id={assumption} />
      </span>
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}
