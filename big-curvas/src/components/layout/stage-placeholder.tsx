import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** Pantalla aún no construida: se reemplaza en la etapa indicada (docs/DEMO_PLAN.md). */
export function StagePlaceholder({ title, stage, description }: { title: string; stage: string; description: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Próximamente <Badge variant="secondary">Etapa {stage}</Badge>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Esta pantalla se construye en la Etapa {stage} de la demo.
        </CardContent>
      </Card>
    </div>
  );
}
