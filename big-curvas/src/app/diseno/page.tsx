import Link from "next/link";
import { cn } from "@/lib/utils";
import { DIRECTIONS } from "./_lib/directions";
import { DirectionPanel } from "./_components/panel";

// TEMPORAL (Etapa 8, Fase A): comparación de las tres direcciones visuales. Se elimina al cerrar la etapa.
export default async function DisenoPage({ searchParams }: PageProps<"/diseno">) {
  const ver = (await searchParams).ver;
  const only = DIRECTIONS.find((d) => d.id === ver);
  const shown = only ? [only] : DIRECTIONS;

  const tab = "rounded-md px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-stone-900";
  return (
    <main className="mx-auto w-full max-w-[1800px] space-y-6 px-4 py-6">
      <header className="space-y-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-stone-600 uppercase">Etapa 8 · Fase A · página temporal</p>
          <h1 className="text-2xl font-semibold">Tres direcciones para Big Curvas</h1>
          <p className="max-w-3xl text-sm text-stone-700">
            Boutique femenina elegante para tallas grandes. Cada columna usa los componentes reales del sistema con sus propios colores, tipografías,
            radios y sombras. Elige una (o pide mezclar, por ejemplo la paleta de una con las tipografías de otra). Abre una sola dirección para verla a ancho completo.
          </p>
        </div>
        <nav aria-label="Vista" className="flex flex-wrap gap-1">
          <Link href="/diseno" aria-current={!only ? "page" : undefined} className={cn(tab, !only ? "bg-stone-900 text-white" : "bg-white text-stone-900 hover:bg-stone-100")}>
            Las tres, lado a lado
          </Link>
          {DIRECTIONS.map((d) => (
            <Link
              key={d.id}
              href={`/diseno?ver=${d.id}`}
              aria-current={only?.id === d.id ? "page" : undefined}
              className={cn(tab, only?.id === d.id ? "bg-stone-900 text-white" : "bg-white text-stone-900 hover:bg-stone-100")}
            >
              {d.id} · {d.name}
            </Link>
          ))}
        </nav>
      </header>

      <div className={cn("grid items-start gap-6", only ? "mx-auto max-w-4xl" : "xl:grid-cols-3")}>
        {shown.map((d) => (
          <DirectionPanel key={d.id} d={d} />
        ))}
      </div>
    </main>
  );
}
