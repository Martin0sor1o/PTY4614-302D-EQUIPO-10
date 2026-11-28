import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoidDone } from "@/components/pos/void-done";
import { decisionAnnouncement, decisionView, type DecisionData } from "./decision";
import { DecisionAnnouncer, DecisionStrip, LiveLink } from "./decision-ui";
import { ABANDON_QUERY_MS, LINK_OK, linkProblem, POLL_MS, SLOW_QUERY_MS, watchApproval, type LinkState, type PollResult } from "./watch-approval";

const NOW = Date.parse("2026-11-28T15:00:00.000Z");
const approval = (patch: Partial<DecisionData> = {}): DecisionData => ({
  status: "PENDIENTE",
  decidedByName: null,
  decisionComment: null,
  method: "REMOTA",
  expiresAt: "2026-11-28T15:10:00.000Z",
  ...patch,
});
const approved = approval({ status: "APROBADA", decidedByName: "Belén", method: "REMOTA" });

describe("la decisión tal como la ve la caja", () => {
  it("mientras está pendiente no hay decisión", () => {
    expect(decisionView(approval(), NOW)).toBeNull();
    expect(decisionAnnouncement(approval())).toBe("Esperando a Belén.");
  });

  it("aprobada: «Aprobado por Belén ✓», con su comentario", () => {
    expect(decisionView({ ...approved, decisionComment: "Dale" }, NOW)).toEqual({ tone: "ok", title: "Aprobado por Belén ✓", detail: "“Dale”" });
    expect(decisionView({ ...approved, method: "PIN" }, NOW)?.title).toBe("Aprobado por Belén ✓ (con PIN, en la tienda)");
    expect(decisionAnnouncement(approved)).toBe("Aprobado por Belén."); // sin el símbolo
  });

  it("aprobada pero pasado su plazo: deja de verse en verde y dice qué hacer", () => {
    const view = decisionView(approved, Date.parse(approved.expiresAt!) + 1);
    expect(view?.tone).toBe("warn");
    expect(view?.detail).toContain("pide una nueva");
  });

  it("rechazada, vencida y usada se distinguen por color y por texto", () => {
    const rejected = approval({ status: "RECHAZADA", decidedByName: "Belén", decisionComment: "Hoy no" });
    expect(decisionView(rejected, NOW)).toEqual({ tone: "danger", title: "Belén rechazó la solicitud", detail: "“Hoy no”" });
    expect(decisionAnnouncement(rejected)).toBe("Belén rechazó la solicitud. Hoy no");
    expect(decisionView(approval({ status: "VENCIDA" }), NOW)).toMatchObject({ tone: "neutral", title: "La solicitud venció" });
    expect(decisionView(approval({ status: "USADA" }), NOW)).toMatchObject({ tone: "info", title: "Esta aprobación ya se usó" });
  });
});

describe("consulta en vivo", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  type Answer = PollResult<string>;
  const ok = (approval: string): Answer => ({ ok: true, approval });

  function watch(query: () => Promise<Answer>) {
    const seen: string[] = [];
    const links: LinkState[] = [];
    const spy = vi.fn(query);
    const stop = watchApproval<string>({ query: spy, onApproval: (a) => seen.push(a), onLink: (l) => links.push(l) });
    const problem = () => linkProblem(links.at(-1) ?? LINK_OK, Date.now());
    return { seen, links, spy, stop, problem };
  }
  const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

  it("pregunta cada 3 s y entrega el cambio de pendiente a aprobada, sin refrescar la pantalla", async () => {
    const query = vi.fn<() => Promise<Answer>>().mockResolvedValueOnce(ok("PENDIENTE")).mockResolvedValue(ok("APROBADA"));
    const w = watch(query);
    expect(w.spy).not.toHaveBeenCalled();
    await advance(POLL_MS);
    await advance(POLL_MS);
    expect(w.seen).toEqual(["PENDIENTE", "APROBADA"]);
    expect(w.problem()).toBeNull();
    w.stop();
    await advance(POLL_MS * 3);
    expect(w.spy).toHaveBeenCalledTimes(2);
  });

  it("un fallo suelto no alarma; dos seguidos sí, y se quita al volver a responder", async () => {
    const query = vi
      .fn<() => Promise<Answer>>()
      .mockRejectedValueOnce(new TypeError("sin red"))
      .mockRejectedValueOnce(new TypeError("sin red"))
      .mockResolvedValue(ok("PENDIENTE"));
    const w = watch(query);
    await advance(POLL_MS);
    expect(w.problem()).toBeNull();
    await advance(POLL_MS);
    expect(w.problem()?.kind).toBe("sin-respuesta");
    await advance(POLL_MS);
    expect(w.problem()).toBeNull();
    w.stop();
  });

  it("sesión vencida: lo dice al primer rechazo", async () => {
    const w = watch(async () => ({ ok: false, message: "Vuelve a entrar.", code: "UNAUTHENTICATED" }));
    await advance(POLL_MS);
    expect(w.problem()).toMatchObject({ kind: "sesion" });
    expect(w.seen).toEqual([]); // nunca se inventa una decisión
    w.stop();
  });

  it("si el servidor no contesta: no apila consultas, lo avisa y vuelve a intentar", async () => {
    const w = watch(() => new Promise<Answer>(() => undefined));
    await advance(POLL_MS);
    await advance(POLL_MS * 2);
    expect(w.spy).toHaveBeenCalledTimes(1);
    expect(w.problem()).toBeNull();
    expect(linkProblem(w.links.at(-1)!, w.links.at(-1)!.pendingSince! + SLOW_QUERY_MS + 1)?.kind).toBe("sin-respuesta");
    await advance(ABANDON_QUERY_MS);
    expect(w.spy.mock.calls.length).toBeGreaterThan(1);
    expect(w.problem()?.kind).toBe("sin-respuesta");
    w.stop();
  });

  it("una respuesta atrasada de una consulta abandonada, o posterior a cerrar la espera, se ignora", async () => {
    const answers: ((a: Answer) => void)[] = [];
    const w = watch(() => new Promise<Answer>((resolve) => answers.push(resolve)));
    await advance(POLL_MS);
    await advance(ABANDON_QUERY_MS);
    expect(answers.length).toBe(2);
    answers[0](ok("VIEJA"));
    await advance(0);
    expect(w.seen).toEqual([]);
    w.stop();
    answers[1](ok("TARDE"));
    await advance(0);
    expect(w.seen).toEqual([]);
  });
});

describe("lo que se dibuja", () => {
  it("el anuncio es una región aria-live fija, solo para lector de pantalla", () => {
    const html = renderToStaticMarkup(createElement(DecisionAnnouncer, { text: "Aprobado por Belén." }));
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('aria-live="polite"');
  });

  it("«En vivo» y, sin respuesta, un texto con ícono (el punto de color es decorativo)", () => {
    const live = renderToStaticMarkup(createElement(LiveLink, { problem: null }));
    expect(live).toContain("En vivo: la respuesta aparece sola.");
    expect(live).toContain("motion-reduce:animate-none");
    const down = renderToStaticMarkup(createElement(LiveLink, { problem: { kind: "sin-respuesta", text: "No puedo consultar" } }));
    expect(down).toContain('aria-live="polite"');
    expect(down).toContain("No puedo consultar");
    expect(down).toContain("<svg");
    expect(down).not.toContain("En vivo");
  });

  it("junto al botón de confirmar: esperando, aprobado o rechazado, sin repetir el anuncio ni tomar el foco", () => {
    const strip = (a: DecisionData) => renderToStaticMarkup(createElement(DecisionStrip, { approval: a }));
    const future = new Date(Date.now() + 600_000).toISOString();
    expect(strip(approval())).toContain("Esperando a Belén…");
    expect(strip({ ...approved, expiresAt: future })).toContain("Aprobado por Belén ✓");
    expect(strip(approval({ status: "RECHAZADA", decidedByName: "Belén" }))).toContain("Belén rechazó la solicitud");
    expect(strip(approval({ status: "USADA" }))).toBe("");
    for (const html of [strip(approval()), strip({ ...approved, expiresAt: future })]) expect(html).not.toMatch(/aria-live|role=|autofocus|<button/);
  });

  it("anulación confirmada: quién aprobó y qué pasó; sin resultado, la región queda vacía (nada de éxito antes de tiempo)", () => {
    const done = (result: Parameters<typeof VoidDone>[0]["result"]) =>
      renderToStaticMarkup(createElement(VoidDone, { result, onClose: () => undefined }));
    expect(done(null)).toBe('<div role="status" aria-live="polite"></div>');
    const withApproval = done({ number: "RGA-000123", approvedBy: "Belén", withApproval: true });
    expect(withApproval).toContain("Aprobado por Belén ✓");
    expect(withApproval).toContain("La venta RGA-000123 quedó anulada y el stock se repuso.");
    expect(done({ number: "RGA-000124", approvedBy: null, withApproval: false })).not.toContain("Aprobado");
  });
});
