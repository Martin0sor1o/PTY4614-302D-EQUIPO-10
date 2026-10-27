import { RAIL_COLLAPSED_PX, RAIL_EXPANDED_PX, DIRECTIONS, railBudgets } from "./_lib/directions";
import { DirectionPanel } from "./_components/panel";

// TEMPORAL (Etapa 8): referencia de la dirección elegida (D). Se elimina al cerrar la etapa.
function RailBudgetBlock() {
  const budgets = railBudgets(1366);
  return (
    <section aria-labelledby="riel-titulo" className="space-y-3 rounded-2xl border border-stone-400/60 bg-white p-4">
      <div>
        <h2 id="riel-titulo" className="text-base font-semibold">El riel en las pantallas críticas (PC de caja de 1366 px)</h2>
        <p className="max-w-4xl text-sm text-stone-700">
          Aplicado en la tanda 1: riel expandido ({RAIL_EXPANDED_PX} px) en las pantallas de lectura y solo íconos ({RAIL_COLLAPSED_PX} px) en POS, caja, escaneo de
          traslados, picking y aprobaciones. El «carrito» es el espacio del lector y las líneas del POS, que mantiene una columna de pago de 23 rem.
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

export default function DisenoPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold tracking-[0.14em] text-stone-600 uppercase">Etapa 8 · página temporal</p>
        <h1 className="text-2xl font-semibold">Dirección elegida: D · Medianoche Rosa</h1>
        <p className="max-w-3xl text-sm text-stone-700">
          Referencia de la dirección que ya está aplicada al sistema (tanda 1). Se elimina al cerrar la etapa; la guía vigente quedará en docs/DISENO.md.
        </p>
      </header>
      <RailBudgetBlock />
      {DIRECTIONS.map((d) => (
        <DirectionPanel key={d.id} d={d} />
      ))}
    </main>
  );
}
