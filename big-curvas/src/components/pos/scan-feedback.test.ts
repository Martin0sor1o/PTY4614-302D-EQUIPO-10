import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  BEEP_PREF_KEY,
  createBeeper,
  createBeepPref,
  NO_BUMPS,
  notFoundNotice,
  searchFailedNotice,
  trackBumps,
  unitLimitNotice,
  type Bumps,
} from "./scan-feedback";
import { BeepToggle, Flash, ScanNoticeRegion } from "./scan-feedback-ui";

type Line = [string, number];
const read = (l: Line) => l;
const step = (prev: Bumps, cart: Line[], ready = true) => trackBumps(prev, cart, read, ready);

describe("qué líneas del carrito destellan", () => {
  it("lo que ya venía al reconstruir el carrito no destella ni suena", () => {
    const restoring = step(NO_BUMPS, [], false);
    const ready = step(restoring, [["a", 2], ["b", 1]]);
    expect(ready.pulses).toEqual({});
    expect(ready.count).toBe(0);
  });

  it("una prenda nueva y una unidad más destellan; el mismo destello no se repite solo", () => {
    let state = step(NO_BUMPS, []);
    const added: Line[] = [["a", 1]];
    state = step(state, added);
    expect(state.pulses).toEqual({ a: 1 });
    expect(step(state, added)).toBe(state); // otro dibujo con el mismo carrito: nada cambia

    state = step(state, [["a", 2]]);
    expect(state.pulses).toEqual({ a: 2 }); // número nuevo: el destello se repite
    state = step(state, [["a", 2], ["b", 1]]);
    expect(state.pulses).toEqual({ a: 2, b: 3 });
    expect(state.count).toBe(3);
  });

  it("quitar unidades, quitar la línea o cambiar el descuento no cuenta como agregar", () => {
    let state = step(step(NO_BUMPS, []), [["a", 3], ["b", 1]]);
    const before = state.count;
    state = step(state, [["a", 2], ["b", 1]]);
    state = step(state, [["a", 2], ["b", 1]]); // arreglo nuevo con las mismas cantidades (cambió el descuento)
    state = step(state, [["a", 2]]);
    expect(state.count).toBe(before);
    expect(state.pulses.b).toBeUndefined();
  });

  it("sin cambios devuelve el mismo objeto (no provoca dibujos en cadena)", () => {
    const cart: Line[] = [];
    const waiting = step(NO_BUMPS, cart, false);
    expect(step(waiting, cart, false)).toBe(waiting);
    const ready = step(waiting, cart, true);
    expect(step(ready, cart, true)).toBe(ready);
  });
});

describe("avisos junto al campo de escaneo", () => {
  it("dicen qué pasó con lo escaneado", () => {
    expect(notFoundNotice("7800000")).toMatchObject({ tone: "danger", title: "No se agregó nada", text: "No se encontró ninguna prenda para “7800000”." });
    expect(unitLimitNotice(1, "JMT012-AZU-48", "Tienda Rancagua").text).toBe("Solo hay 1 disponible de JMT012-AZU-48 en Tienda Rancagua.");
    expect(unitLimitNotice(3, "X", "Y").text).toBe("Solo hay 3 disponibles de X en Y.");
    expect(searchFailedNotice("abc").text).toContain("Revisa la conexión");
  });

  it("el mismo código dos veces es un aviso nuevo", () => {
    expect(notFoundNotice("x").id).not.toBe(notFoundNotice("x").id);
  });

  const region = (notice: ReturnType<typeof notFoundNotice> | null) => renderToStaticMarkup(createElement(ScanNoticeRegion, { notice }));

  it("la región aria-live existe aunque no haya aviso", () => {
    expect(region(null)).toBe('<div role="status" aria-live="polite"></div>');
  });

  it("un código que no se agregó se ve en rojo, con título e ícono (no solo color)", () => {
    const html = region(notFoundNotice("7800000"));
    expect(html).toContain("bg-tone-danger-soft");
    expect(html).toContain("No se agregó nada");
    expect(html).toContain("7800000");
    expect(html).toContain("<svg");
    expect(html).toContain('data-testid="flash-alert"');
  });
});

describe("destello", () => {
  it("es decorativo, no recibe clics y la línea lo dibuja detrás del texto", () => {
    const html = renderToStaticMarkup(createElement(Flash, { tone: "line" }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("-z-10");
    expect(html).toContain("scan-flash");
  });

  it("con movimiento reducido no se anima y queda visible", () => {
    const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.scan-flash \{\s*animation: none !important;/);
  });
});

const memoryStorage = () => {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe("preferencia del sonido", () => {
  it("apagado por omisión; al activarlo se guarda y avisa a la pantalla", () => {
    const storage = memoryStorage();
    const pref = createBeepPref(() => storage);
    const listener = vi.fn();
    pref.subscribe(listener);
    expect(pref.get()).toBe(false);
    expect(pref.getServerSnapshot()).toBe(false);
    pref.set(true);
    expect(pref.get()).toBe(true);
    expect(storage.data.get(BEEP_PREF_KEY)).toBe("1");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(createBeepPref(() => storage).get()).toBe(true); // al volver a abrir la caja
  });

  it.each([
    ["no se puede ni abrir localStorage", () => { throw new Error("SecurityError"); }],
    ["leer y escribir fallan", () => ({ getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("lleno"); } })],
    ["no hay almacenamiento", () => null],
  ])("si %s, la caja funciona igual y el interruptor responde", (_name, storage) => {
    const pref = createBeepPref(storage);
    expect(pref.get()).toBe(false);
    expect(() => pref.set(true)).not.toThrow();
    expect(pref.get()).toBe(true);
    pref.set(false);
    expect(pref.get()).toBe(false);
  });

  const toggle = (on: boolean) => renderToStaticMarkup(createElement(BeepToggle, { on, onToggle: () => undefined }));

  it("el interruptor dice su estado con texto y con aria-checked", () => {
    expect(toggle(false)).toContain('role="switch"');
    expect(toggle(false)).toContain('aria-checked="false"');
    expect(toggle(false)).toContain("Sonido al agregar: apagado");
    expect(toggle(true)).toContain('aria-checked="true"');
    expect(toggle(true)).toContain("Sonido al agregar: activado");
  });
});

describe("sonido", () => {
  it("un tono corto: empieza y termina", () => {
    const tone = { type: "", frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    const gain = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    const resume = vi.fn(async () => undefined);
    const make = vi.fn(() => ({ state: "suspended", currentTime: 1, destination: {}, resume, createOscillator: () => tone, createGain: () => gain }) as unknown as AudioContext);
    const beeper = createBeeper(make);
    beeper.play();
    beeper.play();
    expect(make).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalled();
    expect(tone.start).toHaveBeenCalledWith(1);
    expect(tone.stop.mock.calls[0][0]).toBeLessThan(1.2);
  });

  it("si el equipo no puede sonar, no lanza", () => {
    const beeper = createBeeper(() => {
      throw new Error("sin audio");
    });
    expect(() => beeper.play()).not.toThrow();
  });
});
