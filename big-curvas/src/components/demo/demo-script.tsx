import Link from "next/link";
import type { SessionUser } from "@/lib/access";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_STEPS } from "./demo-script-data";
import { ResetDemoButton } from "./reset-demo-button";

/** DEMO: guion de la presentación. El llamador lo muestra solo con DEMO_MODE=true. */
export function DemoScript({ user }: { user: SessionUser }) {
  return (
    <section aria-labelledby="demo-script-title" className="space-y-4" data-testid="demo-script">
      <div className="space-y-1">
        <h2 id="demo-script-title" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          Guion de demo <Badge>DEMO</Badge>
        </h2>
        <p className="text-sm text-muted-foreground">
          Siete pasos para presentar el sistema. Cambia de usuario con “Salir” → “Entrar como…”. Los usuarios son <strong>Belén</strong> (administradora),{" "}
          <strong>Vendedora Rancagua</strong> y <strong>Vendedora 2 Rancagua</strong>; todos los datos son de ejemplo.
        </p>
      </div>

      <ol className="space-y-3">
        {DEMO_STEPS.map((step, index) => (
          <li key={step.id}>
            <Card data-testid={`demo-step-${step.id}`}>
              <CardHeader>
                <CardTitle className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-black text-xs font-semibold text-brand-pink"
                  >
                    {index + 1}
                  </span>
                  <span>{step.title}</span>
                </CardTitle>
                <CardDescription>
                  Entrar como: <span className="font-medium text-foreground">{step.who}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="list-disc space-y-1 pl-5">
                  {step.show.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Problema que resuelve:</span> {step.problem}
                </p>
                <div className="flex flex-wrap gap-2">
                  {step.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="inline-flex min-h-11 items-center rounded-full border border-input bg-card px-3.5 text-xs font-semibold text-brand-ink transition-colors hover:bg-secondary md:min-h-8"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>

      <p className="rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Números de los documentos.</span> Con el historial cargado, los traslados y pedidos nuevos no parten en{" "}
        <code>TR-000001</code> ni <code>PED-000001</code>: usa el primer número que aparezca. Los casos del plan de demo con esos números solo calzan con el
        seed sin historial (<code>pnpm db:seed</code>).
      </p>

      {user.role === "ADMIN" && (
        <div className="space-y-2" data-testid="demo-reset-section">
          <h3 className="text-sm font-medium">Antes de presentar</h3>
          <ResetDemoButton />
        </div>
      )}
    </section>
  );
}
