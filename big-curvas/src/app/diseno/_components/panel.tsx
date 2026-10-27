import type { ReactNode } from "react";
import { CircleCheck, CircleX, Search, ShoppingBag, Boxes, Truck, Package, Tag, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { contrastRows, directionVars, type Direction, type Tone } from "../_lib/directions";
import { CHIPS, Ornament, StatusChip, Wordmark } from "./brand";
import { DesktopMenu, MobileMenu } from "./menus";
import { PosPreview } from "./pos-preview";
import { StockPreview } from "./stock-preview";

const fmt = (n: number) => n.toFixed(2).replace(".", ",");

function Block({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function IconSample({ d }: { d: Direction }) {
  const icons = [Boxes, ShoppingBag, Truck, Package, Tag, Search];
  return (
    <div className="flex flex-wrap gap-2">
      {icons.map((I, i) => (
        <span key={i} className={cn("grid size-10 place-items-center", d.ui.iconCircle)}>
          <I className="size-5" aria-hidden />
        </span>
      ))}
    </div>
  );
}

function Swatch({ name, hex, note }: { name: string; hex: string; note?: string }) {
  return (
    <div className="min-w-0">
      <div className="h-10 rounded-md border border-foreground/15" style={{ background: hex }} />
      <div className="mt-1 text-xs leading-tight font-medium">{name}</div>
      <div className="font-mono text-[11px] text-muted-foreground">{hex}</div>
      {note && <div className="text-[11px] leading-tight text-muted-foreground">{note}</div>}
    </div>
  );
}

function ContrastTable({ d }: { d: Direction }) {
  const rows = contrastRows(d);
  const fails = rows.filter((r) => r.ratio < r.min).length;
  return (
    <div className="space-y-2">
      <p
        className={cn("flex items-center gap-1.5 text-sm font-semibold", fails ? "text-destructive" : "text-[var(--st-ok-fg)]")}
        data-testid={`contrast-summary-${d.id}`}
      >
        {fails ? <CircleX className="size-4" aria-hidden /> : <CircleCheck className="size-4" aria-hidden />}
        {fails ? `${fails} par(es) no cumplen AA` : `Los ${rows.length} pares cumplen AA`}
      </p>
      <ul className="divide-y rounded-lg border bg-card text-xs">
        {rows.map((r) => {
          const ok = r.ratio >= r.min;
          return (
            <li key={r.label} className="flex items-center gap-2 px-2.5 py-1.5">
              <span
                aria-hidden
                className="grid size-7 shrink-0 place-items-center rounded-sm border border-foreground/15 text-xs font-bold"
                style={{ color: r.fg, background: r.bg }}
              >
                Aa
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                {r.label}
                <span className="block font-mono text-[10px] text-muted-foreground">
                  {r.fg} / {r.bg}
                </span>
              </span>
              <span className="text-right leading-tight tabular-nums">
                <b className="text-sm">{fmt(r.ratio)}:1</b>
                <span className="block text-[10px] text-muted-foreground">mín. {fmt(r.min).replace(",00", "").replace(",50", ",5")}:1</span>
              </span>
              <span className={cn("inline-flex w-14 items-center justify-end gap-1 font-semibold", ok ? "text-[var(--st-ok-fg)]" : "text-destructive")}>
                {ok ? <CircleCheck className="size-3.5" aria-hidden /> : <CircleX className="size-3.5" aria-hidden />}
                {ok ? (r.min === 4.5 && r.ratio >= 7 ? "AAA" : "AA") : "No"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        Texto normal: mínimo 4,5:1. Borde de campo y foco (componentes de interfaz): mínimo 3:1. El tono de acento decorativo no se usa como texto.
      </p>
    </div>
  );
}

export function DirectionPanel({ d }: { d: Direction }) {
  const c = d.colors;
  const tones = Object.keys(d.tones) as Tone[];
  return (
    <article
      id={`dir-${d.id}`}
      data-dir={d.id}
      style={directionVars(d)}
      className="dir @container space-y-8 overflow-hidden rounded-2xl border border-stone-400/60 p-4 @lg:p-6"
    >
      {/* Cabecera */}
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Dirección {d.id}</p>
            <h2 className={cn("dir-display", d.ui.h1)}>{d.name}</h2>
          </div>
          <Ornament id={d.id} className="shrink-0 text-primary" />
        </div>
        <p className="text-sm leading-relaxed">{d.tagline}</p>
        <div className={cn("flex items-center justify-center bg-[var(--dir-menu-bg)] py-6 text-[var(--dir-wordmark)]", d.ui.frame)}>
          <Wordmark id={d.id} className={d.id === "C" ? "text-lg" : "scale-125"} />
        </div>
        <dl className="grid gap-x-4 gap-y-2 text-sm @lg:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">Títulos y marca</dt>
            <dd className="dir-display text-xl">{d.fonts.display}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">Texto, tablas y cajas</dt>
            <dd className="text-base">{d.fonts.body} <span className="tabular-nums text-muted-foreground">0123456789 · $29.990</span></dd>
          </div>
          <div className="@lg:col-span-2 text-xs text-muted-foreground">{d.fonts.why}</div>
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">Radios</dt>
            <dd>{d.radius}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">Sombras</dt>
            <dd>{d.shadow}</dd>
          </div>
          <div className="@lg:col-span-2">
            <dt className="mb-1.5 text-xs font-semibold text-muted-foreground">Iconos: {d.icons}</dt>
            <dd>
              <IconSample d={d} />
            </dd>
          </div>
        </dl>
      </header>

      {/* Pantallas reales en contexto */}
      <Block
        title="Pantalla Stock en contexto"
        hint={d.layout === "rail" ? `Riel lateral ${d.railStartsCollapsed ? "colapsado (solo íconos)" : "expandido"}; el botón de abajo lo alterna.` : "Barra superior y pantalla real con datos de ejemplo."}
      >
        <div className={cn("overflow-hidden bg-background", d.ui.frame)}>
          <div className={cn(d.layout === "rail" ? "flex" : "block")}>
            <DesktopMenu d={d} current="Stock" collapsed={d.railStartsCollapsed} />
            <div className="min-w-0 flex-1">
              <StockPreview d={d} />
            </div>
          </div>
        </div>
      </Block>

      <Block
        title="Pantalla POS (caja) en contexto"
        hint={d.layout === "rail" ? "Pantalla crítica: el riel parte en solo íconos para no perder ancho útil. Misma disposición que la caja real." : "Pantalla crítica: misma disposición que la caja real."}
      >
        <div className={cn("overflow-hidden bg-background", d.ui.frame)}>
          <div className={cn(d.layout === "rail" ? "flex" : "block")}>
            <DesktopMenu d={d} current="POS" collapsed />
            <div className="min-w-0 flex-1">
              <PosPreview d={d} />
            </div>
          </div>
        </div>
      </Block>

      <Block title="Menú en celular" hint="Botón y filas de 44 px de alto (objetivo táctil).">
        <MobileMenu d={d} />
      </Block>

      {/* Componentes */}
      <Block title="Botones">
        <div className="flex flex-wrap items-center gap-2">
          <Button className={d.ui.button}>Cobrar</Button>
          <Button variant="secondary" className={d.ui.button}>Guardar borrador</Button>
          <Button variant="outline" className={d.ui.button}>Cancelar</Button>
          <Button variant="destructive" className={d.ui.button}>Anular venta</Button>
          <Button variant="ghost" className={d.ui.button}>Ver detalle</Button>
          <Button className={d.ui.buttonSm}>Pequeño</Button>
          <Button disabled className={d.ui.button}>Deshabilitado</Button>
        </div>
        <p className="text-xs text-muted-foreground">Pasa el cursor o usa Tab para ver el foco visible: anillo sólido de 2 px con separación.</p>
      </Block>

      <Block title="Formulario">
        <div className={cn("space-y-3 bg-card p-4 ring-1 ring-foreground/10", d.ui.frame)}>
          <div className="space-y-1.5">
            <Label htmlFor={`sku-${d.id}`}>Código o SKU</Label>
            <Input id={`sku-${d.id}`} placeholder="Escanea o escribe el código" className={d.ui.field} />
            <p className="text-xs text-muted-foreground">El lector escribe aquí; Enter agrega la prenda.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ref-${d.id}`}>Referencia de transferencia</Label>
            <Input id={`ref-${d.id}`} aria-invalid defaultValue="12" aria-describedby={`ref-err-${d.id}`} className={d.ui.field} />
            <p id={`ref-err-${d.id}`} className="flex items-center gap-1 text-xs font-medium text-destructive">
              <TriangleAlert className="size-3.5" aria-hidden /> Ingresa al menos 6 caracteres.
            </p>
          </div>
        </div>
      </Block>

      <Block title="Tarjetas">
        <div className="grid gap-3 @lg:grid-cols-2">
          <Card className={d.ui.card}>
            <CardHeader>
              <CardDescription>Ventas de hoy</CardDescription>
              <CardTitle className="dir-display !text-3xl !font-semibold !normal-case !tracking-tight tabular-nums">$184.970</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusChip spec={{ label: "12 ventas · ticket $15.414", tone: "ok", icon: CircleCheck }} d={d} />
            </CardContent>
          </Card>
          <Card className={d.ui.card}>
            <CardHeader>
              <CardDescription>Pedidos por preparar</CardDescription>
              <CardTitle className="dir-display !text-3xl !font-semibold !normal-case !tracking-tight tabular-nums">3</CardTitle>
            </CardHeader>
            <CardContent>
              <Button className={d.ui.buttonSm}>Ir a preparar</Button>
            </CardContent>
          </Card>
        </div>
      </Block>

      <Block title="Badges de estado" hint="Siempre color + ícono + texto, nunca solo color.">
        <div className="flex flex-wrap gap-2">
          {Object.values(CHIPS).map((spec) => (
            <StatusChip key={spec.label} spec={spec} d={d} />
          ))}
        </div>
      </Block>

      <Block title="Tabla">
        <div className={cn("overflow-hidden", d.ui.tableWrap)}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={d.ui.thead}>N.º</TableHead>
                <TableHead className={d.ui.thead}>Clienta</TableHead>
                <TableHead className={d.ui.thead}>Estado</TableHead>
                <TableHead className={cn("text-right", d.ui.thead)}>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["PED-000012", "Camila R.", CHIPS.paid, "$45.980"],
                ["PED-000011", "Javiera M.", CHIPS.pending, "$29.990"],
                ["PED-000010", "Daniela P.", CHIPS.voided, "$18.990"],
              ].map(([n, who, chip, total]) => (
                <TableRow key={n as string}>
                  <TableCell className="font-mono text-xs">{n as string}</TableCell>
                  <TableCell>{who as string}</TableCell>
                  <TableCell>
                    <StatusChip spec={chip as typeof CHIPS.paid} d={d} />
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{total as string}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Block>

      {/* Paleta y contraste */}
      <Block title="Paleta">
        <div className="grid grid-cols-3 gap-3 @lg:grid-cols-4">
          <Swatch name="Fondo" hex={c.bg} />
          <Swatch name="Tarjeta" hex={c.surface} />
          <Swatch name="Tinta" hex={c.ink} />
          <Swatch name="Texto secundario" hex={c.muted} />
          <Swatch name="Primario" hex={c.primary} />
          <Swatch name="Primario (cursor)" hex={c.primaryHover} />
          <Swatch name="Foco" hex={c.ring} />
          <Swatch name="Borde de campo" hex={c.input} />
          <Swatch name="Borde suave" hex={c.border} />
          <Swatch name="Superficie suave" hex={c.soft} />
          <Swatch name="Menú" hex={c.menuBg} />
          <Swatch name="Acento" hex={c.accent} note="Solo decorativo" />
        </div>
        <div className="grid grid-cols-3 gap-2 pt-1">
          {tones.map((t) => (
            <div key={t} className="rounded-md px-2 py-1.5 text-xs font-semibold" style={{ color: d.tones[t][0], background: d.tones[t][1] }}>
              <span className="capitalize">{t === "violet" ? "violeta" : t === "ok" ? "ok" : t === "warn" ? "alerta" : t === "danger" ? "error" : t === "info" ? "info" : "neutro"}</span>
              <span className="block font-mono text-[10px] font-normal">{d.tones[t][0]} / {d.tones[t][1]}</span>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Contraste (WCAG AA)" hint="Calculado con la fórmula de WCAG sobre los mismos colores de esta página.">
        <ContrastTable d={d} />
      </Block>
    </article>
  );
}
