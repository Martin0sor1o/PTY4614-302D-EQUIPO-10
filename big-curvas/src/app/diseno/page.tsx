import Link from "next/link";
import { cn } from "@/lib/utils";
import { DIRECTIONS, RAIL_COLLAPSED_PX, RAIL_EXPANDED_PX, directionById, railBudgets, type Direction } from "./_lib/directions";
import { DirectionPanel } from "./_components/panel";

// TEMPORAL (Etapa 8, Fases A y A2): comparación de direcciones visuales. Se elimina al cerrar la etapa.
type View = { key: string; label: string; items: Direction[]; grid: string };

const pick = (...ids: string[]) => ids.map((id) => directionById(id)).filter((d): d is Direction => Boolean(d));

const VIEWS: View[] = [
  { key: "BDEF", label: "B, D, E y F (riel lateral)", items: pick("B", "D", "E", "F"), grid: "xl:grid-cols-2 min-[1900px]:grid-cols-4" },
  { key: "ABC", label: "A, B y C (Fase A)", items: pick("A", "B", "C"), grid: "xl:grid-cols-3" },
];

function RailBudgetBlock() {
  const budgets = railBudgets(1366);
  return (
    <section aria-labelledby="riel-titulo" className="space-y-3 rounded-2xl border border-stone-400/60 bg-white p-4">
      <div>
        <h2 id="riel-titulo" className="text-base font-semibold">El riel en las pantallas críticas (PC de caja de 1366 px)</h2>
        <p className="max-w-4xl text-sm text-stone-700">
          Un riel expandido ({RAIL_EXPANDED_PX} px) le quita una de cada siete columnas de píxeles al POS. Solo íconos ({RAIL_COLLAPSED_PX} px) deja casi todo el ancho.
          El «carrito» es el espacio del lector y de las líneas del POS real, que mantiene una columna de pago de 23 rem.
        </p>
      </div>
      <ul className="space-y-2">
        {budgets.map((b) => (
          <li key={b.label} className="grid items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[13rem_1fr_9rem]">
            <span>
              <b>{b.label}</b>
              <span className="block text-xs text-stone-600">{b.note}</span>
            </span>
            <div className="flex h-7 overflow-hidden rounded-md border border-stone-400 text-[11px] font-medium" role="img" aria-label={`Riel ${b.railPx} px, contenido ${b.contentPx} px`}>
              {b.railPx > 0 && (
                <span className="grid place-items-center bg-stone-800 text-stone-100" style={{ width: `${(b.railPx / 1366) * 100}%` }}>
                  {b.railPx}
                </span>
              )}
              <span className="grid flex-1 place-items-center bg-stone-100">{b.contentPx} px de contenido</span>
            </div>
            <span className="tabular-nums sm:text-right">
              Carrito: <b>{b.cartPx} px</b>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function DisenoPage({ searchParams }: PageProps<"/diseno">) {
  const ver = String((await searchParams).ver ?? "");
  const single = DIRECTIONS.find((d) => d.id === ver);
  const view = single ? undefined : (VIEWS.find((v) => v.key === ver) ?? VIEWS[0]);
  const items = single ? [single] : view!.items;

  const tab = "rounded-md px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-stone-900";
  const tabCls = (on: boolean) => cn(tab, on ? "bg-stone-900 text-white" : "bg-white text-stone-900 hover:bg-stone-100");
  return (
    <main className="mx-auto w-full max-w-[1800px] space-y-6 px-4 py-6">
      <header className="space-y-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-stone-600 uppercase">Etapa 8 · Fase A2 · página temporal</p>
          <h1 className="text-2xl font-semibold">Direcciones para Big Curvas</h1>
          <p className="max-w-4xl text-sm text-stone-700">
            D, E y F conservan la estructura y las formas de la B (riel lateral, botones en píldora, radios grandes, sombras suaves, íconos de trazo grueso) con la paleta
            actual: negro, rosado #FFF5F8 y vino #9D1F52. El rosado claro solo se usa como texto sobre negro. Cada columna usa los componentes reales del sistema.
            Abre una sola para verla a ancho completo.
          </p>
        </div>
        <nav aria-label="Vista" className="flex flex-wrap gap-1">
          {VIEWS.map((v, i) => (
            <Link key={v.key} href={i === 0 ? "/diseno" : `/diseno?ver=${v.key}`} aria-current={view?.key === v.key ? "page" : undefined} className={tabCls(view?.key === v.key)}>
              {v.label}
            </Link>
          ))}
          {DIRECTIONS.map((d) => (
            <Link key={d.id} href={`/diseno?ver=${d.id}`} aria-current={single?.id === d.id ? "page" : undefined} className={tabCls(single?.id === d.id)}>
              {d.id} · {d.name}
            </Link>
          ))}
        </nav>
      </header>

      {!single && view?.key === "BDEF" && <RailBudgetBlock />}

      <div className={cn("grid items-start gap-6", single ? "mx-auto max-w-4xl" : view?.grid)}>
        {items.map((d) => (
          <DirectionPanel key={d.id} d={d} />
        ))}
      </div>
    </main>
  );
}
