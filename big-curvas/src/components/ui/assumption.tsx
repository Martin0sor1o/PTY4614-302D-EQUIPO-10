import { RETURN_ASSUMPTIONS } from "@/modules/returns/client";
import { cn } from "@/lib/utils";

/**
 * Marca 🟡 de una regla supuesta (ADR-021): la regla aplicada todavía no la validó Belén. Lee el MISMO registro que los docs
 * (`RETURN_ASSUMPTIONS`), así que el texto de ayuda y la pregunta asociada nunca se desincronizan. Lleva el id (S-01…) a la
 * vista para que se entienda también sin pasar el mouse (pantalla táctil, impresión).
 */
export function Assumption({ id, className }: { id: string; className?: string }) {
  const a = RETURN_ASSUMPTIONS.find((x) => x.id === id);
  if (!a) return null;
  const help = `${a.title}: ${a.applied} Supuesto pendiente de validar con Belén (${a.questions.join(", ")}).`;
  return (
    <span data-testid={`assumption-${id}`} title={help} className={cn("inline-flex cursor-help items-center gap-0.5 align-middle text-[11px] font-semibold text-tone-warn", className)}>
      <span aria-hidden>🟡</span>
      <span aria-hidden>{id}</span>
      <span className="sr-only">Supuesto {id} pendiente de validar con Belén. {help}</span>
    </span>
  );
}
