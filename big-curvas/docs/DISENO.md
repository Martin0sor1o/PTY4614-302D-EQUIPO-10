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

## Feedback: avisos, progreso, carga y vacíos

| Componente | Dónde | Para qué |
|---|---|---|
| Aviso de confirmación | `lib/flash.ts`, `components/feedback/` | «Venta RGA-000197 cobrada · $27.990 · vuelto $2.010» |
| Botón con progreso | `components/ui/pending-button.tsx` | «Cobrando…», «Guardando…» |
| Esqueleto de carga | `components/ui/skeleton.tsx` + `loading.tsx` | Reportes, Stock y Kardex |
| Vacío con siguiente paso | `components/ui/empty-state.tsx` | «Aún no hay ventas hoy» → «Ir a vender» |

### Aviso de confirmación

- **Solo después de la confirmación del servidor.** En «en duda» o «sin confirmar» nunca aparece. En la caja y en devoluciones sale tanto al confirmar el envío como al «Reintentar» o «Verificar», y una sola vez.
- **Cómo se usa.** Si la acción cambia de pantalla: quien recibe la confirmación llama a `flashStore.expect(tipo, id)` y la pantalla de destino pone `<ConfirmedFlash>` con el texto armado desde sus datos (`components/feedback/messages.ts`). Así los montos son los que guardó el servidor. Si no cambia de pantalla (aprobar y rechazar): `flashStore.show(texto, tono)`.
- **En `onDone` de un envío pendiente, `expect` va dentro de `try/catch`:** un error ahí dejaría una venta confirmada como «sin confirmar».
- **Códigos de vale:** siempre enmascarados (`maskVoucherCode`).
- **Accesibilidad:** la región `role="status"` con `aria-live="polite"` se monta en el layout y existe aunque esté vacía (si se creara junto con el texto, el lector de pantalla podría no anunciarlo). No toma el foco y no se imprime.
- **Posición:** arriba en celular (abajo están los botones de Aprobaciones) y abajo al centro en escritorio (no tapa el pago del POS). Dura 8 s, se pausa con el puntero o el foco encima y se puede cerrar. Sin animación de entrada.
- **No reemplaza a `Notice`:** los errores y las advertencias siguen en línea, junto a lo que falló.

### Botón con progreso

`<PendingButton pending={…} pendingLabel="Guardando…">`: spinner, texto en curso, deshabilitado y `aria-busy`. Se ve menos apagado que un botón deshabilitado para que el texto se lea. Solo presenta el estado: no ejecuta nada ni genera claves de idempotencia. `ConfirmDialog` acepta `pendingLabel` (por omisión, «Procesando…»).

### Esqueleto de carga

`SkeletonScreen` anuncia qué se carga (texto solo para lector de pantalla) y las piezas `Skeleton` son decorativas. Con movimiento reducido quedan quietas. No usa colores nuevos. Con `loading.tsx` la respuesta se envía por partes: una redirección de una página sin permiso llega dentro del contenido (código 200) en vez de un 307; la página igual se corta antes de consultar datos.

### Vacíos con siguiente paso

`EmptyLine` (texto + acción) y `EmptyAction` (enlace con forma de botón). La acción aparece solo si lleva a algo que la persona puede hacer ahí. `reload` fuerza una recarga completa cuando la pantalla tiene campos que guardan lo escrito (búsqueda de Stock, filtro de Reportes).

### Escaneo en el POS (`components/pos/scan-feedback*`)

La caja se usa con lector de códigos: el feedback nunca quita el foco del campo, no retrasa la lectura siguiente y no cambia cómo se busca.

- **Destello de línea:** al agregar una prenda o sumarle una unidad (lector, lista de resultados o «+»), la línea se marca 0,9 s con fondo `--tone-ok-soft` y borde `--tone-ok`, detrás del texto. El carrito reconstruido al recargar no destella. Con movimiento reducido no se anima: queda fijo ese mismo rato.
- **Lo que no se agregó** (código inexistente, sin más unidades, sin respuesta del servidor): aviso rojo bajo el campo, con ícono y título, en una región `aria-live="polite"` que existe siempre. Cada aviso es nuevo aunque el texto se repita, y su borde destella. «Sin stock en esta tienda» conserva su recuadro con dónde hay.
- **Sonido:** apagado por omisión, un tono corto generado por el navegador (sin archivos) y **solo al agregar**: que no suene también avisa. El interruptor (`role="switch"`) va al final del carrito, devuelve el foco al campo y se guarda en `localStorage` (`bc-pos-beep`) con `try/catch`; sin almacenamiento vale mientras dure la pestaña.
- **Contraste:** el test de tokens cubre el texto sobre `--tone-ok-soft` y los bordes del destello.

### La decisión de Belén en la caja (`components/approvals/`)

Vale para el descuento en la venta, el reembolso o cambio y la anulación de «Ventas del día». Es solo presentación: la consulta es la de siempre (cada 3 s, `getApprovalStatusAction`) y el servidor sigue comprobando la aprobación al usarla.

- **«Aprobado por Belén ✓» o el rechazo con su comentario** llegan sin recargar, en el recuadro de la solicitud. En la venta se repiten en una línea junto a «Confirmar venta» (`DecisionStrip`): con un carrito largo, el recuadro puede quedar fuera de la vista. No toman el foco.
- **«En vivo»** mientras las consultas llegan (`watch-approval.ts`). Si fallan dos seguidas o una tarda más de 10 s, lo dice: «Esperando a Belén…» ya no oculta que no hay respuesta. Si la sesión venció, lo dice y abre el reingreso con PIN (venta y devoluciones; en la anulación solo se avisa). Nunca hay dos consultas a la vez, salvo que una se abandone a los 15 s.
- **Anulación:** el resultado queda sobre la tabla (`VoidDone`), porque al refrescar desaparece el panel desde el que se pidió. Aparece solo cuando el servidor confirmó.
- **Lector de pantalla:** una región fija anuncia la decisión una vez (`DecisionAnnouncer`). El recuadro de espera ya no es `aria-live`: su reloj cambia cada segundo.
- **PIN en la caja:** el campo deja solo dígitos, con el largo que acepta el servidor (4 a 12).

## Gráficos de Reportes (`components/reports/`)

Barras horizontales en CSS, sin dependencias, en la pestaña Ventas (solo ADMIN, como el resto de Reportes).

- **Forma:** una fila por categoría, con nombre, monto en CLP y detalle **en texto**. La barra solo ilustra (`aria-hidden`), así que nada depende del color ni de ver el gráfico. La tabla por período se mantiene como alternativa. Sin hover: todos los valores ya están escritos.
- **Por medio de pago** (rango elegido): suman el total cobrado. «Otros» se llama igual que en la tabla y aparece solo si hay; son pagos con vale, incluido el crédito de un cambio. Un medio con plata nunca se rotula «0 %».
- **Últimas 8 semanas:** de lunes a domingo, hasta hoy, en hora de Chile. No usan el rango de fechas (la pantalla lo dice) y sí el canal. Son **una** llamada a `getSalesByPaymentMethod` agrupada por semana, en paralelo con la del rango. La semana en curso va rayada y rotulada «(en curso)». Se muestran aunque el rango no tenga ventas o sea inválido.
- **Color:** los medios de pago conservan los colores de marca (negro, vino y grises), que no sirven como paleta de categorías por sí solos: por eso cada fila va rotulada. Las semanas usan un solo color.

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
