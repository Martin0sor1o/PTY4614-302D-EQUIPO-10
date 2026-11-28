// La consulta «en vivo» de la caja mientras espera a Belén. SOLO LECTURA: pregunta el estado cada ~3 s con la acción que
// ya existía. Además dice si la pregunta está llegando, para que «Esperando a Belén…» no oculte que no hay respuesta.
//
// Sin React ni DOM (se prueba en Node con relojes falsos).

export const POLL_MS = 3_000;
/** Una consulta que tarda más que esto ya se informa como sin respuesta. */
export const SLOW_QUERY_MS = 10_000;
/** Pasado este rato se deja de esperar esa consulta y se hace otra. */
export const ABANDON_QUERY_MS = 15_000;

export type PollResult<A> = { ok: true; approval: A } | { ok: false; message: string; code?: string };

/** Cómo va la comunicación con el servidor. */
export interface LinkState {
  /** Consultas seguidas sin respuesta útil. */
  failures: number;
  /** Código del último rechazo (p. ej. UNAUTHENTICATED). */
  code?: string;
  /** Desde cuándo está en camino la consulta actual; null si no hay ninguna. */
  pendingSince: number | null;
}

export const LINK_OK: LinkState = { failures: 0, pendingSince: null };

export interface LinkProblem {
  kind: "sesion" | "sin-respuesta";
  text: string;
}

export function linkProblem(link: LinkState, now: number): LinkProblem | null {
  if (link.code === "UNAUTHENTICATED") {
    return { kind: "sesion", text: "La sesión venció: vuelve a entrar para ver la respuesta de Belén." };
  }
  // Un solo fallo suelto no se muestra: la consulta siguiente suele llegar bien.
  if (link.failures >= 2 || (link.pendingSince !== null && now - link.pendingSince > SLOW_QUERY_MS)) {
    return { kind: "sin-respuesta", text: "No puedo consultar la respuesta de Belén: quizás ya contestó. Sigo intentando." };
  }
  return null;
}

/**
 * Empieza a consultar y devuelve cómo detenerlo. Nunca hay dos consultas a la vez (salvo que una se abandone), y una
 * respuesta atrasada o posterior a detenerse se ignora.
 */
export function watchApproval<A>(options: {
  query: () => Promise<PollResult<A>>;
  onApproval: (approval: A) => void;
  onLink: (link: LinkState) => void;
  now?: () => number;
}): () => void {
  const now = options.now ?? (() => Date.now());
  let link = LINK_OK;
  let stopped = false;
  let current = 0;

  const update = (patch: Partial<LinkState>) => {
    link = { ...link, ...patch };
    options.onLink(link);
  };

  function ask() {
    if (stopped) return;
    if (link.pendingSince !== null) {
      if (now() - link.pendingSince < ABANDON_QUERY_MS) return;
      link = { ...link, failures: link.failures + 2 };
    }
    const mine = ++current;
    update({ pendingSince: now() });
    const failed = (code?: string) => update({ pendingSince: null, failures: link.failures + 1, code });
    Promise.resolve()
      .then(options.query)
      .then(
        (result) => {
          if (stopped || mine !== current) return;
          if (!result.ok) return failed(result.code);
          update({ pendingSince: null, failures: 0, code: undefined });
          options.onApproval(result.approval);
        },
        () => {
          if (stopped || mine !== current) return;
          failed(); // conexión cortada: la acción ni siquiera respondió
        },
      );
  }

  const timer = setInterval(ask, POLL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
