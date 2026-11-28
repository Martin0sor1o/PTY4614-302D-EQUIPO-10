import { describe, expect, it, vi } from "vitest";
import { createFlashStore, EXPECT_TTL_MS, type FlashStore } from "./flash";
import { createAttemptController, SEND_TIMEOUT_MS, type AttemptSummary, type LookupResult, type SendResult } from "./pending-attempt";

/** Cuenta cuántas veces APARECE un aviso nuevo (no cuántas veces se avisa a quien escucha). */
function shownMessages(store: FlashStore) {
  const seen: string[] = [];
  let lastId = 0;
  store.subscribe(() => {
    const m = store.getSnapshot();
    if (m && m.id !== lastId) {
      lastId = m.id;
      seen.push(m.text);
    }
  });
  return seen;
}

describe("avisos de confirmación", () => {
  it("entrega solo lo que se anunció, y una sola vez", () => {
    const store = createFlashStore();
    const seen = shownMessages(store);

    expect(store.deliver("venta", "s1", "Venta cobrada")).toBe(false); // abrir un ticket antiguo no avisa
    store.expect("venta", "s1");
    expect(store.deliver("venta", "otra", "Venta cobrada")).toBe(false);
    expect(store.deliver("devolucion", "s1", "Devolución")).toBe(false);
    expect(store.deliver("venta", "s1", "Venta cobrada")).toBe(true);
    expect(store.deliver("venta", "s1", "Venta cobrada")).toBe(false); // efecto repetido o refresco de la pantalla
    expect(seen).toEqual(["Venta cobrada"]);
  });

  it("lo anunciado caduca: volver al comprobante mucho después no avisa", () => {
    let now = 1_000;
    const store = createFlashStore(() => now);
    store.expect("venta", "s1");
    now += EXPECT_TTL_MS + 1;
    expect(store.deliver("venta", "s1", "Venta cobrada")).toBe(false);
    expect(store.getSnapshot()).toBeNull();
  });

  it("el mismo texto dos veces es un aviso nuevo (para que se vuelva a anunciar), y cerrar uno viejo no cierra el nuevo", () => {
    const store = createFlashStore();
    store.show("Solicitud aprobada");
    const first = store.getSnapshot()!;
    store.show("Solicitud aprobada");
    const second = store.getSnapshot()!;
    expect(second.id).not.toBe(first.id);
    store.dismiss(first.id);
    expect(store.getSnapshot()).toBe(second);
    store.dismiss(second.id);
    expect(store.getSnapshot()).toBeNull();
  });

  it("si algo falla al dibujar el aviso, no lanza: quien confirmó la operación sigue su camino", () => {
    const store = createFlashStore();
    store.subscribe(() => {
      throw new Error("pantalla rota");
    });
    expect(() => store.show("Venta cobrada")).not.toThrow();
    store.expect("venta", "s1");
    expect(() => store.deliver("venta", "s1", "Venta cobrada")).not.toThrow();
  });
});

// Con el flujo REAL de envío pendiente (lib/pending-attempt, sin cambios) y el mismo `onDone` de la caja y de devoluciones.

const SUMMARY: AttemptSummary = { operation: "venta", amountLabel: "Total a cobrar", amount: 27_990, lines: ["Polera × 1"], payment: "Efectivo" };
const DONE = { id: "sale-1", number: "RGA-000197" };
const OK: SendResult = { ok: true, ...DONE };

function till(options: {
  send: () => Promise<SendResult>;
  lookup?: () => Promise<LookupResult>;
  store?: FlashStore;
}) {
  const store = options.store ?? createFlashStore();
  const seen = shownMessages(store);
  const onDone = vi.fn(({ id }: { id: string }) => {
    try {
      store.expect("venta", id);
    } catch {
      // igual que en la pantalla
    }
  });
  const controller = createAttemptController<{ total: number }>({
    slot: "venta:test",
    storage: null,
    send: options.send,
    lookup: options.lookup ?? (async () => ({ ok: true, found: null })),
    onDone,
  });
  controller.load();
  const submit = () => controller.submit({ content: { total: 27_990 }, payload: { total: 27_990 }, summary: SUMMARY, userId: "u1" });
  /** Lo que hace la pantalla de destino cada vez que se monta o se refresca. */
  const openTicket = () => store.deliver("venta", DONE.id, "Venta RGA-000197 cobrada");
  return { controller, submit, openTicket, onDone, seen };
}

const lost = () => Promise.reject(new Error("sin conexión"));

describe("aviso y envío pendiente", () => {
  it("un «Reintentar» exitoso muestra el aviso una sola vez", async () => {
    const send = vi.fn<() => Promise<SendResult>>().mockImplementationOnce(lost).mockResolvedValue(OK);
    const t = till({ send });

    expect((await t.submit()).status).toBe("en_duda");
    expect(t.openTicket()).toBe(false); // en duda: nunca hay aviso de éxito
    await t.controller.retry("u1");
    await t.controller.retry("u1"); // un segundo clic ya no hace nada

    expect(t.openTicket()).toBe(true);
    expect(t.openTicket()).toBe(false);
    expect(t.onDone).toHaveBeenCalledTimes(1);
    expect(t.seen).toEqual(["Venta RGA-000197 cobrada"]);
  });

  it("un «Verificar» exitoso muestra el aviso una sola vez", async () => {
    const t = till({ send: lost, lookup: async () => ({ ok: true, found: DONE }) });

    await t.submit();
    await t.controller.verify();
    await t.controller.verify();

    expect(t.openTicket()).toBe(true);
    expect(t.openTicket()).toBe(false);
    expect(t.onDone).toHaveBeenCalledTimes(1);
    expect(t.seen).toHaveLength(1);
  });

  it("si la respuesta atrasada llega después de verificar, no hay un segundo aviso", async () => {
    vi.useFakeTimers();
    try {
      let answer!: (r: SendResult) => void;
      const t = till({ send: () => new Promise<SendResult>((resolve) => (answer = resolve)), lookup: async () => ({ ok: true, found: DONE }) });

      const sending = t.submit();
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);
      expect((await sending).status).toBe("en_duda");
      await t.controller.verify();
      expect(t.openTicket()).toBe(true);
      answer(OK);
      await vi.advanceTimersByTimeAsync(0);

      expect(t.openTicket()).toBe(false);
      expect(t.onDone).toHaveBeenCalledTimes(1);
      expect(t.seen).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sin confirmación del servidor no hay aviso: envío perdido, «Verificar» sin resultado y «Reintentar» rechazado", async () => {
    const send = vi.fn<() => Promise<SendResult>>().mockImplementationOnce(lost).mockResolvedValue({ ok: false, message: "No hay caja abierta." });
    const t = till({ send });

    await t.submit();
    await t.controller.verify();
    await t.controller.retry("u1");

    expect(t.controller.getSnapshot().phase).toBe("en_duda");
    expect(t.openTicket()).toBe(false);
    expect(t.onDone).not.toHaveBeenCalled();
    expect(t.seen).toEqual([]);
  });

  it("un rechazo del servidor tampoco avisa", async () => {
    const t = till({ send: async () => ({ ok: false, message: "Sin stock.", code: "STOCK_INSUFICIENTE" }) });
    expect((await t.submit()).status).toBe("rechazada");
    expect(t.openTicket()).toBe(false);
    expect(t.seen).toEqual([]);
  });

  it("si anunciar el aviso fallara, la venta confirmada NO queda como «sin confirmar»", async () => {
    const broken: FlashStore = {
      ...createFlashStore(),
      expect: () => {
        throw new Error("almacén roto");
      },
    };
    const t = till({ send: async () => OK, store: broken });
    expect((await t.submit()).status).toBe("registrada");
    expect(t.controller.getSnapshot().phase).toBe("registrada");
  });
});
