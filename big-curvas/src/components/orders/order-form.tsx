"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ScanLine, Search, Trash2, UserRound } from "lucide-react";
import { saveOrderAction, searchCustomersAction, searchOrderVariantsAction } from "@/app/(app)/pedidos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { bpsToPercent, formatCLP, parseCLP, percentToBps } from "@/lib/money";
import { priceOrder } from "@/modules/sales/client";
import { cn } from "@/lib/utils";

interface Availability {
  locationId: string;
  name: string;
  available: number;
}

export interface FormLine {
  variantId: string;
  sku: string;
  description: string;
  unitPrice: number;
  qty: number;
  discountBps: number;
  availability: Availability[];
}

export interface FormCustomer {
  id: string;
  name: string;
  instagramHandle: string | null;
  phone: string | null;
  address: string | null;
  commune: string | null;
}

export interface OrderFormInitial {
  orderId?: string;
  channel: "INSTAGRAM" | "WHATSAPP";
  customer: FormCustomer | null;
  lines: FormLine[];
  shippingCost: number;
  shippingAddress: string;
  notes: string;
}

const EMPTY_NEW = { name: "", instagramHandle: "", phone: "", address: "", commune: "" };

const joinAddress = (address?: string | null, commune?: string | null) => [address, commune].filter(Boolean).join(", ");

/**
 * Registro / edición de un pedido online (solo Belén). Muestra el disponible en bodega y en la tienda por línea,
 * pero NO aparta nada: se aparta al confirmar el pago (RN-07). Los montos son solo de referencia: el servidor
 * recalcula todo con sales/pricing.
 */
export function OrderForm({ initial }: { initial: OrderFormInitial }) {
  const router = useRouter();
  const [channel, setChannel] = useState(initial.channel);
  const [customer, setCustomer] = useState<FormCustomer | null>(initial.customer);
  const [newCustomer, setNewCustomer] = useState(EMPTY_NEW);
  const [creating, setCreating] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerHits, setCustomerHits] = useState<FormCustomer[] | null>(null);
  const [lines, setLines] = useState<FormLine[]>(initial.lines);
  const [shipping, setShipping] = useState(String(initial.shippingCost));
  const [address, setAddress] = useState(initial.shippingAddress);
  const [addressEdited, setAddressEdited] = useState(initial.shippingAddress !== "");
  const [notes, setNotes] = useState(initial.notes);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Awaited<ReturnType<typeof searchOrderVariantsAction>> | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();
  const scanRef = useRef<HTMLInputElement>(null);
  // La misma clave para todos los reintentos de "registrar" (doble clic, red lenta): un solo pedido.
  const saveKey = useRef(crypto.randomUUID());

  const shippingCost = parseCLP(shipping) ?? 0;
  const totals = useMemo(
    () => (lines.length ? priceOrder(lines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.qty, discountBps: l.discountBps })), Math.max(0, shippingCost)) : null),
    [lines, shippingCost],
  );

  function autofillAddress(a?: string | null, c?: string | null) {
    if (!addressEdited) setAddress(joinAddress(a, c));
  }

  async function searchCustomer() {
    const q = customerQuery.trim();
    if (!q) return;
    const res = await searchCustomersAction(q);
    if (!res.ok) return setMessage({ kind: "error", text: res.message });
    setCustomerHits(res.items);
    if (res.items.length === 0) setMessage({ kind: "info", text: `No hay clientas para “${q}”. Puedes crear una nueva.` });
    else setMessage(null);
  }

  function pickCustomer(c: FormCustomer) {
    setCustomer(c);
    setCreating(false);
    setCustomerHits(null);
    setCustomerQuery("");
    autofillAddress(c.address, c.commune);
  }

  function addVariant(item: { variantId: string; sku: string; productName: string; color: string; size: string; unitPrice: number; availability: Availability[] }) {
    setLines((prev) => {
      const found = prev.find((l) => l.variantId === item.variantId);
      // La misma prenda suma la cantidad (el pedido tiene una sola línea por prenda).
      if (found) return prev.map((l) => (l.variantId === item.variantId ? { ...l, qty: l.qty + 1, availability: item.availability } : l));
      return [
        ...prev,
        {
          variantId: item.variantId,
          sku: item.sku,
          description: `${item.productName} · ${item.color} · T${item.size}`,
          unitPrice: item.unitPrice,
          qty: 1,
          discountBps: 0,
          availability: item.availability,
        },
      ];
    });
    setHits(null);
    setQuery("");
    setMessage(null);
    scanRef.current?.focus();
  }

  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    const res = await searchOrderVariantsAction(q);
    setSearching(false);
    if (!res.ok) return setMessage({ kind: "error", text: res.message });
    if (res.items.length === 1) return addVariant(res.items[0]);
    if (res.items.length === 0) {
      setHits(null);
      return setMessage({ kind: "error", text: `No hay prendas para “${q}”.` });
    }
    setMessage(null);
    setHits(res);
  }

  const patch = (variantId: string, change: Partial<FormLine>) =>
    setLines((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, ...change } : l)));

  function save() {
    setMessage(null);
    if (!customer && !(creating && newCustomer.name.trim())) {
      return setMessage({ kind: "error", text: "Elige una clienta o ingresa el nombre de una nueva." });
    }
    startTransition(async () => {
      const res = await saveOrderAction({
        orderId: initial.orderId,
        idempotencyKey: saveKey.current,
        body: {
          channel,
          ...(customer && !creating ? { customerId: customer.id } : { newCustomer }),
          lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, discountBps: l.discountBps })),
          shippingCost,
          shippingAddress: address,
          notes: notes || undefined,
        },
      });
      if (!res.ok) return setMessage({ kind: "error", text: res.message });
      router.push(`/pedidos/${res.orderId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Canal y clienta */}
      <section className="space-y-3 rounded-xl border bg-card p-4" aria-labelledby="sec-clienta">
        <h2 id="sec-clienta" className="font-medium">
          Clienta y canal
        </h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Canal del pedido">
          {(["INSTAGRAM", "WHATSAPP"] as const).map((c) => (
            <Button key={c} type="button" role="radio" aria-checked={channel === c} variant={channel === c ? "default" : "outline"} onClick={() => setChannel(c)}>
              {c === "INSTAGRAM" ? "Instagram" : "WhatsApp"}
            </Button>
          ))}
        </div>

        {customer && !creating ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2" data-testid="selected-customer">
            <div className="flex items-center gap-2 text-sm">
              <UserRound className="size-4 text-muted-foreground" aria-hidden />
              <span className="font-medium">{customer.name}</span>
              {customer.instagramHandle && <span className="text-muted-foreground">@{customer.instagramHandle}</span>}
              {customer.phone && <span className="text-muted-foreground">{customer.phone}</span>}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCustomer(null)}>
              Cambiar
            </Button>
          </div>
        ) : creating ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="c-name">Nombre *</Label>
                <Input
                  id="c-name"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-ig">@Instagram</Label>
                <Input id="c-ig" value={newCustomer.instagramHandle} onChange={(e) => setNewCustomer({ ...newCustomer, instagramHandle: e.target.value })} autoComplete="off" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-phone">Teléfono</Label>
                <Input id="c-phone" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} autoComplete="off" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-commune">Comuna</Label>
                <Input
                  id="c-commune"
                  value={newCustomer.commune}
                  onChange={(e) => {
                    setNewCustomer({ ...newCustomer, commune: e.target.value });
                    autofillAddress(newCustomer.address, e.target.value);
                  }}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="c-address">Dirección</Label>
                <Input
                  id="c-address"
                  value={newCustomer.address}
                  onChange={(e) => {
                    setNewCustomer({ ...newCustomer, address: e.target.value });
                    autofillAddress(e.target.value, newCustomer.commune);
                  }}
                  autoComplete="off"
                />
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>
              Buscar una clienta existente
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  aria-label="Buscar clienta"
                  placeholder="Buscar por nombre, @instagram o teléfono…"
                  className="pl-8"
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void searchCustomer();
                    }
                  }}
                />
              </div>
              <Button type="button" variant="outline" onClick={() => void searchCustomer()}>
                Buscar
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreating(true)}>
                <Plus /> Nueva clienta
              </Button>
            </div>
            {customerHits && customerHits.length > 0 && (
              <ul className="divide-y rounded-lg border bg-background" aria-label="Clientas encontradas">
                {customerHits.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => pickCustomer(c)} className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">
                        {[c.instagramHandle && `@${c.instagramHandle}`, c.phone, c.commune].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Prendas */}
      <section className="space-y-3" aria-labelledby="sec-prendas">
        <h2 id="sec-prendas" className="font-medium">
          Prendas
        </h2>
        <form
          role="search"
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <div className="relative w-full sm:max-w-lg">
            <ScanLine className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              ref={scanRef}
              autoComplete="off"
              aria-label="Escanear o buscar prenda"
              placeholder="Escanea el código de barras o busca por SKU o nombre…"
              className="h-11 pl-8 text-base"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" size="lg" className="h-11 px-4" disabled={searching}>
            {searching ? "Buscando…" : "Buscar"}
          </Button>
        </form>

        {hits?.ok && hits.items.length > 1 && (
          <ul className="divide-y rounded-xl border bg-card" aria-label="Resultados de la búsqueda">
            {hits.items.map((item) => (
              <li key={item.variantId}>
                <button type="button" onClick={() => addVariant(item)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left outline-none hover:bg-muted focus-visible:bg-muted">
                  <span>
                    <span className="font-mono text-xs">{item.sku}</span>
                    <span className="ml-2 text-sm">
                      {item.productName} · {item.color} · T{item.size}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">{item.availability.map((a) => `${a.name}: ${a.available}`).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prenda</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-center">Cantidad</TableHead>
                <TableHead className="text-center">Dcto. %</TableHead>
                <TableHead>Disponible hoy</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Escanea la primera prenda del pedido. Registrar no aparta nada: se aparta al confirmar el pago.
                  </TableCell>
                </TableRow>
              )}
              {lines.map((l, i) => {
                const priced = totals?.lines[i];
                const bodega = l.availability[0];
                const short = bodega ? bodega.available < l.qty : false;
                return (
                  <TableRow key={l.variantId} data-testid="order-form-line">
                    <TableCell>
                      <div className="font-mono text-xs">{l.sku}</div>
                      <div className="text-sm">{l.description}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(l.unitPrice)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button type="button" variant="outline" size="icon-sm" aria-label={`Quitar una unidad de ${l.sku}`} onClick={() => patch(l.variantId, { qty: Math.max(1, l.qty - 1) })}>
                          <Minus />
                        </Button>
                        <span className="w-8 text-center font-semibold tabular-nums">{l.qty}</span>
                        <Button type="button" variant="outline" size="icon-sm" aria-label={`Sumar una unidad de ${l.sku}`} onClick={() => patch(l.variantId, { qty: Math.min(1_000, l.qty + 1) })}>
                          <Plus />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Descuento de ${l.sku} en %`}
                        inputMode="decimal"
                        className="mx-auto h-8 w-16 text-center"
                        defaultValue={l.discountBps ? String(bpsToPercent(l.discountBps)) : ""}
                        placeholder="0"
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(",", "."));
                          patch(l.variantId, { discountBps: Number.isFinite(n) ? Math.min(10_000, Math.max(0, percentToBps(n))) : 0 });
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-xs">
                      {l.availability.map((a) => (
                        <div key={a.locationId} className={cn(a === bodega && short && "font-medium text-amber-700")}>
                          {a.name}: <span className="tabular-nums">{a.available}</span>
                        </div>
                      ))}
                      {short && <div className="mt-0.5 text-amber-700">Bodega no alcanza hoy</div>}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{priced ? formatCLP(priced.lineTotal) : "—"}</TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar ${l.sku}`} onClick={() => setLines((prev) => prev.filter((x) => x.variantId !== l.variantId))}>
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Envío y totales */}
      <section className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2" aria-labelledby="sec-envio">
        <div className="space-y-3">
          <h2 id="sec-envio" className="font-medium">
            Envío por courier
          </h2>
          <div className="space-y-1">
            <Label htmlFor="ship-cost">Costo de envío cobrado a la clienta (CLP)</Label>
            <Input id="ship-cost" inputMode="numeric" value={shipping} onChange={(e) => setShipping(e.target.value)} className="max-w-48" />
            <p className="text-xs text-muted-foreground">Se ingresa a mano. Va dentro del total de la venta.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ship-address">Dirección de despacho *</Label>
            <Input
              id="ship-address"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setAddressEdited(true);
              }}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <dl className="space-y-1 self-start text-sm" data-testid="order-totals">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{totals ? formatCLP(totals.subtotal) : "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Descuentos</dt>
            <dd className="tabular-nums">{totals ? `-${formatCLP(totals.discountTotal)}` : "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Envío</dt>
            <dd className="tabular-nums">{formatCLP(Math.max(0, shippingCost))}</dd>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Total a cobrar</dt>
            <dd className="tabular-nums" data-testid="order-total">
              {totals ? formatCLP(totals.total) : "—"}
            </dd>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">El servidor recalcula los montos al guardar.</p>
        </dl>
      </section>

      {message && (
        <p role="alert" className={cn("text-sm font-medium", message.kind === "error" ? "text-red-700" : "text-muted-foreground")}>
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" size="lg" className="h-11 px-4" onClick={() => router.push(initial.orderId ? `/pedidos/${initial.orderId}` : "/pedidos")}>
          Cancelar
        </Button>
        <Button type="button" size="lg" className="h-11 px-4" onClick={save} disabled={pending || lines.length === 0}>
          {pending ? "Guardando…" : initial.orderId ? "Guardar cambios" : "Registrar pedido"}
        </Button>
      </div>
    </div>
  );
}
