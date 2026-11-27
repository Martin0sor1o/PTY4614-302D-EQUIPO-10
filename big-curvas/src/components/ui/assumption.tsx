import { DELIVERED_ONLINE_OPEN_NOTE, RETURN_ASSUMPTIONS } from "@/modules/returns/client";
import { cn } from "@/lib/utils";

/**
 * Marca de una regla de ADR-021: dice si Belén ya la validó (✅ y la fecha) o si sigue siendo un supuesto (🟡). Lee el MISMO
 * registro que los docs (`RETURN_ASSUMPTIONS`), así que el texto de ayuda y la pregunta asociada nunca se desincronizan.
 * Lleva el id (S-01…) y el estado a la vista para que se entienda también sin pasar el mouse (pantalla táctil, impresión).
 */
export function Assumption({ id, className }: { id: string; className?: string }) {
  const a = RETURN_ASSUMPTIONS.find((x) => x.id === id);
  if (!a) return null;
  const validated = a.validatedOn ? `validado con Belén el ${a.validatedOn}` : null;
  const status = validated
    ? `Regla validada con Belén el ${a.validatedOn}.${a.openForDeliveredOnline ? ` ${DELIVERED_ONLINE_OPEN_NOTE}` : ""}`
    : `Supuesto pendiente de validar con Belén (${a.questions.join(", ")}).`;
  const help = `${a.title}: ${a.applied} ${status}`;
  return (
    <span data-testid={`assumption-${id}`} title={help} className={cn("inline-block cursor-help align-middle text-[11px] leading-tight font-semibold", validated ? "text-tone-ok" : "text-tone-warn", className)}>
      <span aria-hidden>{validated ? `✅ ${id} · ${validated}` : `🟡 ${id}`}</span>
      <span className="sr-only">Regla {id}. {help}</span>
    </span>
  );
}
