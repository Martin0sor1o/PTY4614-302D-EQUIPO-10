import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSensitiveOnLogout,
  createAttemptController,
  fingerprintOf,
  maskVoucherCode,
  NO_RESPONSE_MESSAGE,
  NOT_FOUND_MESSAGE,
  SLOW_MESSAGE,
  type AttemptStorage,
  type AttemptSummary,
  type LookupResult,
  type SendResult,
} from "./pending-attempt";

const VOUCHER = "VAL-C7KM-4QRT-9XWZ";

interface Payload {
  lines: { variantId: string; qty: number }[];
  voucherCode?: string;
}

function memoryStorage(): AttemptStorage & { dump: () => string } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    dump: () => [...map.entries()].map(([k, v]) => `${k}=${v}`).join("\n"),
  };
}

const SUMMARY: AttemptSummary = { operation: "venta", amountLabel: "Total a cobrar", amount: 8_990, lines: ["PBA041-NEG-XL × 1"], payment: "Débito" };
const OK: SendResult = { ok: true, id: "sale-1", number: "RGA-000001" };
const payload = (qty = 1, voucherCode?: string): Payload => ({ lines: [{ variantId: "v1", qty }], voucherCode });
const input = (p: Payload, userId = "u1") => ({ content: p, payload: p, summary: SUMMARY, userId });

function setup(options: { storage?: AttemptStorage; send?: (...a: unknown[]) => Promise<SendResult>; lookup?: () => Promise<LookupResult>; timeoutMs?: number } = {}) {
  const storage = options.storage ?? memoryStorage();
  const send = vi.fn(options.send ?? (async () => OK));
  const lookup = vi.fn(options.lookup ?? (async (): Promise<LookupResult> => ({ ok: true, found: null })));
  const onDone = vi.fn();
  let n = 0;
  const controller = createAttemptController<Payload>({
    slot: "venta:Tienda Rancagua",
    storage,
    send,
    lookup,
    onDone,
    newKey: () => `clave-numero-${++n}-${Math.random().toString(36).slice(2, 8)}`,
    timeoutMs: options.timeoutMs,
  });
  controller.load();
  return { controller, storage, send, lookup, onDone, view: () => controller.getSnapshot() };
}

const lostResponse = async (): Promise<SendResult> => {
  throw new TypeError("Failed to fetch");
};
const keyOf = (send: ReturnType<typeof vi.fn>, call: number) => send.mock.calls[call][1] as string;

afterEach(() => vi.useRealTimers());

describe("envío pendiente: clave de idempotencia", () => {
  it("si se pierde la respuesta, el reintento envía EXACTAMENTE lo mismo con la misma clave", async () => {
    let calls = 0;
    const t = setup({ send: async () => (++calls === 1 ? lostResponse() : OK) });

    expect(await t.controller.submit(input(payload()))).toEqual({ status: "en_duda" });
    expect(t.view()).toMatchObject({ phase: "en_duda", message: NO_RESPONSE_MESSAGE });
    await t.controller.retry("u1");

    expect(t.send).toHaveBeenCalledTimes(2);
    expect(t.send.mock.calls[1][0]).toEqual(t.send.mock.calls[0][0]);
    expect(keyOf(t.send, 1)).toBe(keyOf(t.send, 0));
    expect(t.send.mock.calls[1][2]).toBe("u1"); // el servidor sabe que es un reintento y de quién
    expect(t.view()).toMatchObject({ phase: "registrada", done: { number: "RGA-000001" } });
    expect(t.onDone).toHaveBeenCalledTimes(1);
  });

  it("recargar la pantalla recupera el envío en duda: misma clave y mismo contenido", async () => {
    const storage = memoryStorage();
    const before = setup({ storage, send: lostResponse });
    await before.controller.submit(input(payload(2)));

    const after = setup({ storage });
    expect(after.view()).toMatchObject({ phase: "en_duda", record: { summary: SUMMARY } });
    expect(after.view().record?.payload).toEqual(payload(2));
    await after.controller.retry("u1");
    expect(keyOf(after.send, 0)).toBe(keyOf(before.send, 0));
    expect(after.send.mock.calls[0][0]).toEqual(payload(2));
    expect(storage.length).toBe(0); // con el éxito se borra todo
  });

  it("el envío se guarda ANTES de enviarlo: recargar durante “Procesando…” no pierde la clave", async () => {
    const storage = memoryStorage();
    const first = setup({ storage, send: () => new Promise<SendResult>(() => undefined) });
    void first.controller.submit(input(payload()));
    expect(first.view().phase).toBe("enviando");

    expect(setup({ storage }).view()).toMatchObject({ phase: "en_duda", record: { key: keyOf(first.send, 0) } });
  });

  it("mientras está en duda no se puede enviar otro contenido", async () => {
    const t = setup({ send: lostResponse });
    await t.controller.submit(input(payload(1)));
    expect(await t.controller.submit(input(payload(3)))).toEqual({ status: "ignorada" });
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it("doble clic: el segundo no envía nada", async () => {
    const t = setup();
    const [a, b] = await Promise.all([t.controller.submit(input(payload())), t.controller.submit(input(payload()))]);
    expect([a.status, b.status]).toEqual(["registrada", "ignorada"]);
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it("tras un rechazo del servidor, el mismo contenido conserva la clave y un contenido distinto usa otra", async () => {
    const t = setup({ send: async () => ({ ok: false, message: "Sin stock", code: "STOCK_INSUFICIENTE" }) });

    expect(await t.controller.submit(input(payload(1)))).toMatchObject({ status: "rechazada", result: { code: "STOCK_INSUFICIENTE" } });
    expect(t.view().phase).toBe("libre");
    await t.controller.submit(input(payload(1)));
    expect(keyOf(t.send, 1)).toBe(keyOf(t.send, 0));
    await t.controller.submit(input(payload(2)));
    expect(keyOf(t.send, 2)).not.toBe(keyOf(t.send, 0));
  });

  it("después de un éxito, una venta idéntica usa una clave nueva", async () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    await first.controller.submit(input(payload()));
    const second = setup({ storage });
    await second.controller.submit(input(payload()));
    expect(keyOf(second.send, 0)).not.toBe(keyOf(first.send, 0));
  });

  it("la huella ignora el orden de las propiedades y cambia con cualquier dato", () => {
    expect(fingerprintOf({ a: 1, b: [1, 2] })).toBe(fingerprintOf({ b: [1, 2], a: 1, c: undefined }));
    expect(fingerprintOf(payload(1))).not.toBe(fingerprintOf(payload(2)));
    expect(fingerprintOf(payload(1, VOUCHER))).not.toBe(fingerprintOf(payload(1)));
    expect(fingerprintOf(payload(1, VOUCHER))).not.toContain("C7KM");
  });

  it("un error inesperado del servidor (uncertain) deja el envío en duda", async () => {
    const t = setup({ send: async () => ({ ok: false, message: "Ocurrió un error inesperado.", uncertain: true }) });
    expect(await t.controller.submit(input(payload()))).toEqual({ status: "en_duda" });
    expect(t.view().phase).toBe("en_duda");
  });

  it("un rechazo en el REINTENTO no desbloquea", async () => {
    let calls = 0;
    const t = setup({ send: async () => (++calls === 1 ? lostResponse() : { ok: false, message: "No hay caja abierta", code: "CONFLICT" }) });
    await t.controller.submit(input(payload()));
    await t.controller.retry("u1");
    expect(t.view()).toMatchObject({ phase: "en_duda", busy: null, message: "No hay caja abierta" });
    expect(await t.controller.submit(input(payload(2)))).toEqual({ status: "ignorada" });
  });

  it("otra persona no puede reintentar (sí verificar)", async () => {
    const t = setup({ send: lostResponse, lookup: async () => ({ ok: true, found: { id: "sale-9", number: "RGA-000009" } }) });
    await t.controller.submit(input(payload(), "u1"));
    await t.controller.retry("u2");
    expect(t.send).toHaveBeenCalledTimes(1);
    await t.controller.verify();
    expect(t.view()).toMatchObject({ phase: "registrada", done: { number: "RGA-000009" } });
  });
});

describe("envío pendiente: verificar", () => {
  it("si ya se registró, termina como un éxito y no reenvía nada", async () => {
    const t = setup({ send: lostResponse, lookup: async () => ({ ok: true, found: { id: "sale-1", number: "RGA-000001" } }) });
    await t.controller.submit(input(payload()));
    await t.controller.verify();
    expect(t.lookup).toHaveBeenCalledWith(keyOf(t.send, 0));
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.onDone).toHaveBeenCalledTimes(1);
    expect(t.storage.length).toBe(0);
  });

  it("si no aparece, sigue bloqueado", async () => {
    const t = setup({ send: lostResponse });
    await t.controller.submit(input(payload()));
    await t.controller.verify();
    expect(t.view()).toMatchObject({ phase: "en_duda", busy: null, message: NOT_FOUND_MESSAGE });
  });

  it("si la consulta también falla, sigue bloqueado", async () => {
    const t = setup({
      send: lostResponse,
      lookup: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await t.controller.submit(input(payload()));
    await t.controller.verify();
    expect(t.view()).toMatchObject({ phase: "en_duda", busy: null, message: NO_RESPONSE_MESSAGE });
  });
});

describe("envío pendiente: respuesta lenta (30 s)", () => {
  const deferred = () => {
    let resolve!: (r: SendResult) => void;
    return { promise: new Promise<SendResult>((r) => (resolve = r)), resolve: (r: SendResult) => resolve(r) };
  };

  it("avisa que no hay respuesta y, si el éxito llega atrasado, lo muestra", async () => {
    vi.useFakeTimers();
    const first = deferred();
    const t = setup({ send: () => first.promise });
    const submitting = t.controller.submit(input(payload()));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await submitting).toEqual({ status: "en_duda" });
    expect(t.view()).toMatchObject({ phase: "en_duda", message: SLOW_MESSAGE });

    first.resolve(OK);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.view().phase).toBe("registrada");
    expect(t.onDone).toHaveBeenCalledTimes(1);
  });

  it("si el primer envío termina rechazado y no hubo reintento, la pantalla se libera", async () => {
    vi.useFakeTimers();
    const first = deferred();
    const t = setup({ send: () => first.promise });
    void t.controller.submit(input(payload()));
    await vi.advanceTimersByTimeAsync(30_000);
    first.resolve({ ok: false, message: "Sin stock", code: "STOCK_INSUFICIENTE" });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.view()).toMatchObject({ phase: "libre", message: "Sin stock" });
  });

  it("si ya hay un reintento en camino, el rechazo atrasado del primero NO libera", async () => {
    vi.useFakeTimers();
    const first = deferred();
    const second = deferred();
    let calls = 0;
    const t = setup({ send: () => (++calls === 1 ? first.promise : second.promise) });
    void t.controller.submit(input(payload()));
    await vi.advanceTimersByTimeAsync(30_000);
    void t.controller.retry("u1");
    first.resolve({ ok: false, message: "Sin stock", code: "STOCK_INSUFICIENTE" });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.view().phase).toBe("en_duda");
    second.resolve(OK);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.view().phase).toBe("registrada");
    expect(t.onDone).toHaveBeenCalledTimes(1);
  });
});

describe("código del vale en sessionStorage", () => {
  it("se borra al tener éxito", async () => {
    const t = setup();
    await t.controller.submit(input(payload(1, VOUCHER)));
    expect(t.storage.length).toBe(0);
  });

  it("no queda guardado después de un rechazo (ni en el envío ni en la huella)", async () => {
    const storage = memoryStorage();
    const t = setup({ storage, send: async () => ({ ok: false, message: "El vale no tiene saldo", code: "CONFLICT" }) });
    await t.controller.submit(input(payload(1, VOUCHER)));
    expect(storage.length).toBe(1);
    expect(storage.dump()).not.toContain("C7KM");
  });

  it("al cerrar sesión se borra, la clave en duda se conserva y ya solo se puede verificar", async () => {
    const storage = memoryStorage();
    const before = setup({ storage, send: lostResponse });
    await before.controller.submit(input(payload(1, VOUCHER)));
    expect(storage.dump()).toContain(VOUCHER);
    storage.setItem("bc-pos-cart:Tienda Rancagua", "[]"); // no es de los envíos: no se toca

    clearSensitiveOnLogout(storage);
    expect(storage.dump()).not.toContain("C7KM");
    expect(storage.getItem("bc-pos-cart:Tienda Rancagua")).toBe("[]");

    const after = setup({ storage });
    expect(after.view()).toMatchObject({ phase: "en_duda", record: { key: keyOf(before.send, 0), voucherRemoved: true } });
    await after.controller.retry("u1");
    expect(after.send).not.toHaveBeenCalled();
    await after.controller.verify();
    expect(after.lookup).toHaveBeenCalledWith(keyOf(before.send, 0));
  });

  it("al cerrar sesión, un envío sin vale queda intacto y las claves que no están en duda se descartan", async () => {
    const storage = memoryStorage();
    const doubt = setup({ storage, send: lostResponse });
    await doubt.controller.submit(input(payload(1)));
    const saved = storage.dump();
    clearSensitiveOnLogout(storage);
    expect(storage.dump()).toBe(saved);

    storage.setItem("bc-intento:devolucion:Tienda Rancagua", JSON.stringify({ v: 1, key: "clave-libre-123", fingerprint: "x", userId: "u1", status: "preparada" }));
    clearSensitiveOnLogout(storage);
    expect(storage.dump()).not.toContain("clave-libre-123");
  });

  it("en pantalla solo se muestran los últimos 4 caracteres", () => {
    expect(maskVoucherCode(VOUCHER)).toBe("Vale …9XWZ");
    expect(maskVoucherCode("valc7km4qrt9xwz")).toBe("Vale …9XWZ");
  });

  it("el controlador no escribe nada en la consola (ni claves ni vales)", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    let calls = 0;
    const t = setup({ send: async () => (++calls === 1 ? lostResponse() : OK) });
    await t.controller.submit(input(payload(1, VOUCHER)));
    await t.controller.verify();
    await t.controller.retry("u1");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe("sin sessionStorage", () => {
  it("la clave se conserva en memoria mientras la pantalla siga abierta", async () => {
    const send = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(OK);
    const controller = createAttemptController<Payload>({ slot: "venta:x", storage: null, send, lookup: async () => ({ ok: true, found: null }), onDone: () => undefined });
    controller.load();
    await controller.submit(input(payload()));
    await controller.retry("u1");
    expect(send.mock.calls[1][1]).toBe(send.mock.calls[0][1]);
    expect(controller.getSnapshot().phase).toBe("registrada");
  });
});
