// Envío pendiente de una operación de la caja (cobro, devolución o cambio). Sirve para que una respuesta perdida no
// termine en un segundo cobro: la clave de idempotencia y el envío EXACTO se guardan en sessionStorage ANTES de enviar, y
// mientras no se sepa si quedó registrado solo se puede VERIFICAR (consulta por clave) o REINTENTAR lo mismo.
//
// La clave cambia solo si la persona cambia el contenido o después de un éxito. Recargar, reconstruir el carrito o
// recibir un rechazo del servidor no la cambian.
//
// Lógica sin React ni DOM (se prueba en Node). La pantalla la usa con components/attempts/use-attempt.

/** Lo que responde el envío. `uncertain`: falló algo inesperado en el servidor, no se sabe si alcanzó a registrar. */
export type SendResult =
  | { ok: true; id: string; number: string }
  | { ok: false; message: string; code?: string; uncertain?: boolean; variantId?: string };

export type LookupResult = { ok: true; found: { id: string; number: string } | null } | { ok: false; message: string; code?: string };

/** Lo que se muestra del envío guardado (sin datos que no se puedan ver en pantalla: el vale va enmascarado). */
export interface AttemptSummary {
  operation: "venta" | "devolucion" | "cambio";
  /** Monto en CLP (entero) con su etiqueta ya redactada por la pantalla. */
  amountLabel: string;
  amount: number;
  lines: string[];
  payment: string;
  /** Vale enmascarado (ver `maskVoucherCode`). */
  voucher?: string;
}

export interface StoredAttempt<P extends object> {
  v: 1;
  key: string;
  /** Huella (hash) del contenido: no permite recuperar lo que se escribió. */
  fingerprint: string;
  userId: string;
  /** preparada: hay clave para este contenido y nada en duda. en_duda: se envió y no se sabe si quedó registrado. */
  status: "preparada" | "en_duda";
  /** El envío exacto (sin la clave). Solo mientras está en duda. */
  payload: P | null;
  summary: AttemptSummary | null;
  sentAt: string | null;
  /** Al cerrar sesión se borró el código del vale: ese envío ya no se puede repetir, solo verificar. */
  voucherRemoved?: boolean;
}

export interface AttemptView<P extends object> {
  phase: "cargando" | "libre" | "enviando" | "en_duda" | "registrada";
  record: StoredAttempt<P> | null;
  busy: "reintentando" | "verificando" | null;
  /** Qué pasó en el último envío, reintento o verificación (solo mientras está en duda). */
  message: string | null;
  done: { id: string; number: string } | null;
}

export type SubmitOutcome =
  | { status: "registrada" }
  | { status: "en_duda" }
  /** Rechazo definitivo del primer envío: no quedó nada registrado y la pantalla sigue editable. */
  | { status: "rechazada"; result: Extract<SendResult, { ok: false }> }
  | { status: "ignorada" };

export type AttemptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const PREFIX = "bc-intento:";
export const SEND_TIMEOUT_MS = 30_000;

export const NO_RESPONSE_MESSAGE = "Se cortó la conexión o el servidor no respondió.";
export const SLOW_MESSAGE = "El servidor no ha respondido en 30 segundos. Puedes esperar o recargar la página: el envío queda guardado.";
export const NOT_FOUND_MESSAGE =
  "Todavía no aparece registrada. Si la conexión está lenta, el primer envío puede estar en camino: usa “Reintentar”, que envía lo mismo.";

export const OTHER_USER_MESSAGE = "Este envío lo hizo otra persona: solo ella puede reintentarlo. Puedes verificar si quedó registrado.";

/**
 * En el SERVIDOR: ¿es un reintento hecho por alguien distinto de quien envió? Si el primer envío no alcanzó a llegar,
 * repetirlo registraría la operación a nombre de otra persona.
 */
export function isRetryByAnotherUser(payload: unknown, currentUserId: string): boolean {
  const owner = (payload as { retryOfUserId?: unknown } | null | undefined)?.retryOfUserId;
  return typeof owner === "string" && owner !== currentUserId;
}

const TIMEOUT = Symbol("timeout");

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMEOUT), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Hash de 53 bits (cyrb53). No es criptográfico: solo compara contenidos sin dejar escrito el código de un vale. */
function hash(text: string): string {
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 2654435761);
    b = Math.imul(b ^ c, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36);
}

/** Huella del contenido, independiente del orden de las propiedades. Las listas las ordena quien llama. */
export function fingerprintOf(content: unknown): string {
  return hash(stable(content));
}

/** "VAL-C7KM-4QRT-9XWZ" → "Vale …9XWZ": lo único del código que se muestra. */
export function maskVoucherCode(code: string): string {
  return `Vale …${code.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase()}`;
}

function parse<P extends object>(raw: string | null): StoredAttempt<P> | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as StoredAttempt<P> | null;
    const valid =
      r?.v === 1 &&
      typeof r.key === "string" &&
      r.key.length >= 8 &&
      typeof r.fingerprint === "string" &&
      typeof r.userId === "string" &&
      (r.status === "preparada" || (r.status === "en_duda" && typeof r.summary === "object" && r.summary !== null));
    return valid ? r : null;
  } catch {
    return null;
  }
}

/**
 * Al cerrar sesión: se borra el código de vale de cualquier envío guardado. La clave de un envío en duda se CONSERVA (para
 * poder verificar si se registró); las claves que no están en duda se descartan.
 */
export function clearSensitiveOnLogout(storage: AttemptStorage): void {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => k?.startsWith(PREFIX) === true);
  for (const key of keys) {
    const record = parse<Record<string, unknown>>(storage.getItem(key));
    if (!record || record.status !== "en_duda") {
      storage.removeItem(key);
    } else if (record.payload && "voucherCode" in record.payload && record.payload.voucherCode !== undefined) {
      const payload = { ...record.payload };
      delete payload.voucherCode;
      storage.setItem(key, JSON.stringify({ ...record, payload, voucherRemoved: true }));
    }
  }
}

export interface AttemptOptions<P extends object> {
  /** Operación y ubicación, ej. "venta:Tienda Rancagua". */
  slot: string;
  /** null si el navegador no deja usar sessionStorage: el envío queda solo en memoria. */
  storage: AttemptStorage | null;
  /** `retryOfUserId` va solo en los reintentos: el servidor rechaza que lo repita otra persona. */
  send: (payload: P, idempotencyKey: string, retryOfUserId?: string) => Promise<SendResult>;
  lookup: (idempotencyKey: string) => Promise<LookupResult>;
  /** Se llama UNA vez cuando se confirma que quedó registrada (por el envío, un reintento o la verificación). */
  onDone: (done: { id: string; number: string }) => void;
  newKey?: () => string;
  now?: () => Date;
  timeoutMs?: number;
}

export function createAttemptController<P extends object>(options: AttemptOptions<P>) {
  const { storage, send, lookup, onDone } = options;
  const storageKey = PREFIX + options.slot;
  const newKey = options.newKey ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? SEND_TIMEOUT_MS;

  const initial: AttemptView<P> = { phase: "cargando", record: null, busy: null, message: null, done: null };
  let view = initial;
  /** Copia en memoria: manda si sessionStorage no está disponible o falla. */
  let memory: StoredAttempt<P> | null = null;
  let retries = 0;
  const listeners = new Set<() => void>();

  function set(patch: Partial<AttemptView<P>>) {
    view = { ...view, ...patch };
    for (const listener of listeners) listener();
  }

  function read(): StoredAttempt<P> | null {
    try {
      return storage ? parse<P>(storage.getItem(storageKey)) : memory;
    } catch {
      return memory;
    }
  }

  function write(record: StoredAttempt<P>) {
    memory = record;
    try {
      storage?.setItem(storageKey, JSON.stringify(record));
    } catch {
      // sin espacio o bloqueado: queda en memoria
    }
  }

  function remove() {
    memory = null;
    try {
      storage?.removeItem(storageKey);
    } catch {
      // sin sessionStorage
    }
  }

  function finish(done: { id: string; number: string }, key: string) {
    if (view.phase === "registrada") return;
    // Solo borra su propio envío: una respuesta atrasada no puede llevarse la clave de otro intento.
    if (read()?.key === key) remove();
    set({ phase: "registrada", record: null, busy: null, message: null, done });
    onDone(done);
  }

  /** Nada quedó registrado: se conserva la clave para este contenido, pero se borra el envío guardado (incluido el vale). */
  function release(record: StoredAttempt<P>) {
    if (read()?.key === record.key) write({ ...record, status: "preparada", payload: null, summary: null, sentAt: null });
    set({ phase: "libre", record: null, busy: null, message: null });
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => view,
    getServerSnapshot: () => initial,

    /** Lee lo guardado en la pestaña. Un envío que quedó en duda (también por recargar mientras se enviaba) bloquea. */
    load() {
      if (view.phase !== "cargando") return;
      const record = read();
      if (record?.status === "en_duda") set({ phase: "en_duda", record });
      else set({ phase: "libre" });
    },

    async submit(input: { content: unknown; payload: P; summary: AttemptSummary; userId: string }): Promise<SubmitOutcome> {
      if (view.phase !== "libre") return { status: "ignorada" };
      const fingerprint = fingerprintOf(input.content);
      const previous = read();
      const record: StoredAttempt<P> = {
        v: 1,
        key: previous?.fingerprint === fingerprint ? previous.key : newKey(),
        fingerprint,
        userId: input.userId,
        status: "en_duda",
        payload: input.payload,
        summary: input.summary,
        sentAt: now().toISOString(),
      };
      write(record); // ANTES de enviar: si se recarga a medias, el envío sigue ahí
      retries = 0;
      set({ phase: "enviando", record, busy: null, message: null, done: null });

      const doubt = (message: string): SubmitOutcome => {
        set({ phase: "en_duda", record, message });
        return { status: "en_duda" };
      };

      let request: Promise<SendResult>;
      try {
        request = send(input.payload, record.key);
        const result = await withTimeout(request, timeoutMs);
        if (result === TIMEOUT) {
          // La respuesta del primer envío todavía puede llegar.
          request.then(
            (late) => {
              if (late.ok) finish(late, record.key);
              // Su propio rechazo es definitivo SOLO si no hay un reintento en camino que aún pueda registrarla.
              else if (!late.uncertain && retries === 0 && view.phase === "en_duda") {
                release(record);
                set({ message: late.message });
              }
            },
            () => undefined,
          );
          return doubt(SLOW_MESSAGE);
        }
        if (result.ok) {
          finish(result, record.key);
          return { status: "registrada" };
        }
        if (result.uncertain) return doubt(result.message);
        release(record);
        return { status: "rechazada", result };
      } catch {
        return doubt(NO_RESPONSE_MESSAGE);
      }
    },

    /**
     * Repite el envío guardado con la MISMA clave. Si ya se había registrado, el servidor devuelve esa misma operación.
     * Un rechazo NO desbloquea: con el primer envío en duda, no se permite enviar un contenido distinto.
     */
    async retry(currentUserId: string): Promise<{ code?: string }> {
      const record = view.record;
      if (view.phase !== "en_duda" || view.busy || !record?.payload || record.voucherRemoved || record.userId !== currentUserId) return {};
      retries += 1;
      set({ busy: "reintentando", message: null });
      try {
        const request = send(record.payload, record.key, record.userId);
        const result = await withTimeout(request, timeoutMs);
        if (result === TIMEOUT) {
          request.then(
            (late) => {
              if (late.ok) finish(late, record.key);
            },
            () => undefined,
          );
          set({ busy: null, message: SLOW_MESSAGE });
          return {};
        }
        if (result.ok) {
          finish(result, record.key);
          return {};
        }
        if (view.phase === "en_duda") set({ busy: null, message: result.message });
        return { code: result.code };
      } catch {
        if (view.phase === "en_duda") set({ busy: null, message: NO_RESPONSE_MESSAGE });
        return {};
      }
    },

    /** Consulta de SOLO LECTURA por la clave. "No aparece" no desbloquea: el primer envío puede estar en camino. */
    async verify(): Promise<{ code?: string }> {
      const record = view.record;
      if (view.phase !== "en_duda" || view.busy || !record) return {};
      set({ busy: "verificando", message: null });
      try {
        const result = await withTimeout(lookup(record.key), timeoutMs);
        if (result === TIMEOUT) {
          set({ busy: null, message: SLOW_MESSAGE });
          return {};
        }
        if (result.ok && result.found) {
          finish(result.found, record.key);
          return {};
        }
        if (view.phase === "en_duda") set({ busy: null, message: result.ok ? NOT_FOUND_MESSAGE : result.message });
        return { code: result.ok ? undefined : result.code };
      } catch {
        if (view.phase === "en_duda") set({ busy: null, message: NO_RESPONSE_MESSAGE });
        return {};
      }
    },
  };
}

export type AttemptController<P extends object> = ReturnType<typeof createAttemptController<P>>;
