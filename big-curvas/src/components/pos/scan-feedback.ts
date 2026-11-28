// Feedback al escanear en el POS: qué líneas destellan, qué dice cada aviso y el sonido opcional. Solo presentación:
// no busca, no valida stock ni cambia el carrito. Sin React ni DOM al importar (se prueba en Node).

export interface ScanNotice {
  /** Cambia en cada aviso, aunque el texto se repita: así se vuelve a ver y a anunciar. */
  id: number;
  /** danger: lo escaneado NO se agregó. warn: hay algo que revisar. */
  tone: "danger" | "warn";
  title?: string;
  text: string;
}

let noticeSeq = 0;

export function scanNotice(tone: ScanNotice["tone"], text: string, title?: string): ScanNotice {
  return { id: ++noticeSeq, tone, text, title };
}

export function notFoundNotice(query: string): ScanNotice {
  return scanNotice("danger", `No se encontró ninguna prenda para “${query}”.`, "No se agregó nada");
}

export function unitLimitNotice(available: number, sku: string, locationName: string): ScanNotice {
  return scanNotice("danger", `Solo hay ${available} disponible${available === 1 ? "" : "s"} de ${sku} en ${locationName}.`, "No quedan más unidades");
}

export function searchFailedNotice(query: string): ScanNotice {
  return scanNotice("danger", `No se pudo buscar “${query}”. Revisa la conexión y escanea de nuevo.`, "No se agregó nada");
}

// ── Líneas que destellan ──

export interface Bumps {
  /** El carrito que se miró la última vez. */
  source: readonly unknown[] | null;
  /** Cantidad por variante la última vez; null mientras el carrito no está listo (se está restaurando). */
  seen: Record<string, number> | null;
  /** variantId → número del último destello de esa línea (sirve de `key`: cada número nuevo lo repite). */
  pulses: Record<string, number>;
  /** Destellos desde que se abrió la pantalla. Sube solo cuando algo se agregó. */
  count: number;
}

export const NO_BUMPS: Bumps = { source: null, seen: null, pulses: {}, count: 0 };

/**
 * Compara el carrito con el anterior y marca las líneas nuevas o con más unidades. Lo que ya estaba cuando el carrito
 * quedó listo (reconstruido al recargar) no destella. Devuelve el MISMO objeto si no hay nada que actualizar.
 */
export function trackBumps<T>(prev: Bumps, cart: readonly T[], read: (line: T) => readonly [string, number], ready: boolean): Bumps {
  if (!ready) return prev.source === cart && prev.seen === null ? prev : { source: cart, seen: null, pulses: {}, count: prev.count };
  if (prev.source === cart && prev.seen !== null) return prev;
  const seen: Record<string, number> = {};
  const pulses: Record<string, number> = {};
  let count = prev.count;
  for (const line of cart) {
    const [id, qty] = read(line);
    seen[id] = qty;
    if (prev.seen !== null && qty > (prev.seen[id] ?? 0)) pulses[id] = ++count;
    else if (prev.pulses[id] !== undefined) pulses[id] = prev.pulses[id];
  }
  return { source: cart, seen, pulses, count };
}

// ── Sonido opcional ──

export const BEEP_PREF_KEY = "bc-pos-beep";
export const BEEP_SECONDS = 0.08;

type PrefStorage = Pick<Storage, "getItem" | "setItem">;

/** Preferencia del sonido, apagado por omisión. Sin almacenamiento (bloqueado o lleno) vale mientras dure la pestaña. */
export function createBeepPref(storage: () => PrefStorage | null) {
  let chosen: boolean | null = null;
  const listeners = new Set<() => void>();
  return {
    get(): boolean {
      if (chosen !== null) return chosen;
      try {
        return storage()?.getItem(BEEP_PREF_KEY) === "1";
      } catch {
        return false;
      }
    },
    getServerSnapshot: () => false,
    set(on: boolean) {
      chosen = on;
      try {
        storage()?.setItem(BEEP_PREF_KEY, on ? "1" : "0");
      } catch {
        // sin localStorage: queda en memoria
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Un tono corto generado por el navegador (sin archivos de audio). Si el equipo no puede sonar, no pasa nada. */
export function createBeeper(newContext: () => AudioContext) {
  let context: AudioContext | null = null;
  return {
    play() {
      try {
        context ??= newContext();
        if (context.state === "suspended") void context.resume().catch(() => undefined);
        const tone = context.createOscillator();
        const volume = context.createGain();
        const start = context.currentTime;
        tone.type = "sine";
        tone.frequency.value = 880;
        // Sube y baja suave para que no haga "clic".
        volume.gain.setValueAtTime(0.0001, start);
        volume.gain.exponentialRampToValueAtTime(0.15, start + 0.01);
        volume.gain.exponentialRampToValueAtTime(0.0001, start + BEEP_SECONDS);
        tone.connect(volume);
        volume.connect(context.destination);
        tone.start(start);
        tone.stop(start + BEEP_SECONDS);
      } catch {
        // sin audio disponible: la caja sigue igual
      }
    },
  };
}

export const beepPref = createBeepPref(() => window.localStorage);
export const beeper = createBeeper(() => new AudioContext());
