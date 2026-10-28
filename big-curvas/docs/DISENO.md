# DISENO – Dirección visual de Big Curvas (Etapa 8)

Referencia de la dirección visual elegida («D») y de las reglas para mantenerla. La fuente de verdad de los colores es
`src/app/globals.css`; este documento explica el porqué. Las capturas de comparación de las direcciones evaluadas están en
`docs/diseno/`. La página temporal `/diseno` con las tres direcciones se eliminó al cerrar la etapa.

## Principios

1. **Marca sobria:** negro, rosado y vino sobre un fondo rosado muy claro. El rosado claro nunca va como texto sobre claro.
2. **Se usa de pie y con guantes:** la vendedora cobra con lector de códigos y la bodega se opera desde el celular. Objetivos táctiles de 44 px en móvil.
3. **Un solo `h1` por pantalla** y títulos distintos en cada ruta (`<título> · Big Curvas`).
4. **El color nunca es la única señal:** los estados llevan texto (y a veces ícono), no solo tono.
5. **Los documentos impresos no dependen del tema:** ticket y guías salen en papel blanco y tinta negra.

## Tipografías (`src/app/layout.tsx`)

| Uso | Familia | Variable |
|---|---|---|
| Texto, tablas, formularios | Nunito Sans | `--font-nunito` → `font-sans` |
| Títulos grandes y marca | Playfair Display | `--font-playfair` → `font-display` |
| SKU, números de documento, ticket | Geist Mono | `--font-geist-mono` → `font-mono` |

Playfair solo se usa en títulos grandes y en la marca. Las cifras salen con números alineados (`lining-nums`) y las tablas con `tabular-nums`.
Geist Mono se mantiene porque el ticket impreso y los SKU dependen de ella; quitarla cambiaría el papel.

## Tokens de color

Todos viven en `:root` de `globals.css` y se exponen a Tailwind en `@theme` (por ejemplo `bg-tone-ok-soft`, `text-brand-ink`).
**No se usan clases de color directas de Tailwind** (`bg-red-500`, `text-gray-600`…) en `src`.

- **Marca:** `--brand-black`, `--brand-pink` (solo sobre negro), `--brand-pink-strong` (contadores sobre negro), `--brand-tint` (fondo del área de trabajo), `--brand-ink` (vino: énfasis y enlaces sobre claro).
- **Superficies y texto:** `--background`, `--card`, `--popover`, `--muted`, `--secondary`, `--accent` y sus `*-foreground`; `--muted-foreground` para texto secundario.
- **Acción:** `--primary` (vino) con `--primary-hover`; `--destructive` y el par `--tone-danger` / `--tone-danger-foreground` para el botón de peligro sólido.
- **Bordes y foco:** `--border` (decorativo), `--input` (borde de campo, ≥ 3:1) y `--ring` (anillo de foco).
- **Riel lateral y menú móvil:** `--sidebar*` (negro con acentos rosados).
- **Estados, pares `[texto, fondo suave]`:** `ok`, `warn`, `danger`, `info`, `neutral` y `violet`. Cada par cumple ≥ 5,5:1.
- **Papel:** `--paper`, `--paper-ink`, `--paper-muted`, `--paper-rule`, `--paper-box`. Mismos valores que los grises que usaban el ticket y las guías, para que la impresión no cambie.

Los colores de producto del seed (`seed-data.ts`) son datos, no interfaz, y no pasan por tokens.

## Accesibilidad

- **Contraste (WCAG 2.x AA):** texto ≥ 4,5:1; estados ≥ 5,5:1; borde de campo y anillo de foco ≥ 3:1.
  El test `src/app/design-tokens.test.ts` calcula los ratios leyendo `globals.css` y falla si un cambio de color rompe un par.
- **Foco visible** en todo el sistema: anillo sólido de 2 px con 2 px de separación (`:focus-visible` en `globals.css`); sobre el riel negro es rosado (`--sidebar-ring`).
- **Movimiento reducido:** con `prefers-reduced-motion` no hay animaciones ni transiciones.
- **Táctil:** en móvil, enlaces y botones llegan a 44 px (`min-h-11`); en escritorio pueden ser más compactos (`md:min-h-8`).
- **Enlace «Saltar al contenido»** al inicio de cada página (`#contenido`).

## Estructura de pantalla (`src/components/layout/`)

- **Riel lateral** en escritorio, **abierto por defecto**. La preferencia (abierto/contraído) se guarda en `localStorage` y un script en `<head>` la aplica antes del primer pintado (`rail-pref.ts`); sin `localStorage` queda abierto.
- **Menú móvil** con los mismos elementos; en móvil el menú pasa a una segunda línea en vez de desplazarse.
- **Barra de contexto** arriba del contenido: ubicación siempre visible, «Operando en» (solo ADMIN) y sesión.
- **Celular:** Stock, Preparar pedido y Recibir traslado pasan a tarjetas; Pedidos y Traslados reordenan o esconden columnas en vez de desplazarse.
- Radios grandes (`--radius` = 14 px) y botones en píldora.

## Impresión

`globals.css` define dos páginas con nombre, y solo sale el documento (los controles llevan `print:hidden`):

- **Ticket de venta:** térmico de 80 mm (`@page ticket`).
- **Guía de traslado** y **lista sugerida del viernes** (ambas con la clase `guia`): A4 con márgenes de 15 mm (`@page guia`).

Ambos usan los tokens de papel. Al migrar de colores sueltos a tokens se verificó, con el medio `print` emulado, que el ticket (normal y anulado) y la guía (en tránsito, con diferencias y borrador) salen **píxel a píxel iguales** que antes.
El texto de 10 px del ticket es intencional: réplica del papel térmico.

## Cómo cambiar algo sin romperlo

1. Cambia el valor en `globals.css` (nunca una clase suelta en un componente).
2. Corre `pnpm test` (el test de contraste avisa si un par deja de cumplir).
3. Si tocas el papel (`--paper*`), revisa la impresión del ticket y de las guías.
4. Si agregas un estado nuevo, define su par `--tone-*` y `--tone-*-soft` y agrégalo a la lista de pares del test.

## Verificación de la Etapa 8

- Auditoría de 37 rutas a 1440 y 375 px (con los roles de Belén y de la vendedora): sin errores de consola, sin scroll horizontal, títulos propios, un `h1` por pantalla, riel abierto por defecto, foco visible y objetivos táctiles de 44 px. Corrigió `/sin-acceso` (sin `h1`) y varios enlaces bajo 44 px.
- Aviso de desarrollo: en `pnpm dev` la auditoría de foco marcó como «sin foco» el botón del overlay de Next (`nextjs-portal`), que no es de la aplicación. Se comprobó solo en desarrollo.
