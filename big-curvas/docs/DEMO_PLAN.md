# DEMO_PLAN – Demo funcional de Big Curvas

> Documento de seguimiento. Se marca a medida que se avanza; si la sesión se reinicia, retomar desde la primera casilla sin marcar.
> Rama: `feature/demo` · Todo el código vive en `big-curvas/` · Un commit por etapa (Conventional Commits) · Sin push sin pedirlo.

**Objetivo:** demo presentable a Belén que muestre, con datos de ejemplo, cómo el stock se mueve entre `TIENDA_RANCAGUA` y `BODEGA` (casa de Belén, que la opera con su rol ADMIN). El modelo sigue siendo multi-ubicación (ADR-017). Documentos en v0.4 (reunión con la clienta, 2026-10-02). Construida con el stack definitivo y las reglas de `CLAUDE.md`, para ser la base de la Fase 1.

## Checklist de etapas

- [x] **Etapa 0 – Plan** (aprobado por el usuario; respuestas registradas abajo)
- [x] **Etapa 1 – Base del proyecto**
  - [x] Next.js + TS strict + Tailwind + shadcn/ui + Prisma + Zod + Vitest (pnpm)
  - [x] `docker-compose.yml`, `.env.example`, `.gitignore`
  - [x] Esquema Prisma + migración (mostrar SQL y esperar aprobación antes de aplicar)
  - [x] `src/lib/money.ts` y `src/lib/dates.ts` + tests
  - [x] Seed (ubicaciones, usuarios, ~20 productos, stock con `CARGA_INICIAL`, ledger cuadra; desde v0.4: 2 ubicaciones y 3 usuarios)
  - [x] Login demo "Entrar como…" (`DEMO_MODE`) + `getCurrentUser()` + `requireAccess()`
  - [x] Layout con menú por rol e indicador "Ubicación: X"
  - [x] lint + typecheck + tests · commit
- [x] **Etapa 2 – InventoryService + matriz de stock**
  - [x] Migrar el seed para que use InventoryService (quitar escritura directa `// SEED:`)
  - [x] `src/modules/inventory` (receive, adjust, sell, reserve, releaseReservation, consumeReservation, sendTransfer, receiveTransfer)
  - [x] Tests de integración contra Postgres real (venta OK, stock insuficiente, reserva bloquea venta, concurrencia última unidad, traspaso con diferencia, ledger cuadra, idempotencia, acceso cruzado)
  - [x] Pantalla Stock (matriz + búsqueda + auto-refresco)
  - [x] Pantalla Kardex
  - [x] lint + typecheck + tests · commit
- [x] **Etapa 3 – Identidad visual y POS por tienda**
  - [x] 3.0 Tokens de marca en `globals.css`, `<BrandLogo />` (usa `public/brand/logo.png` si existe), barra/menú en negro, contraste AA verificado
  - [x] Escaneo con foco permanente + búsqueda, carrito, descuento por línea (límite en `settings`)
  - [x] Pago efectivo (vuelto, redondeo $10) / débito-crédito (voucher) / transferencia (referencia), ticket 80 mm
  - [x] Sin stock: otras ubicaciones (consulta) / unidad reservada: se indica
  - [x] Apertura y cierre de caja (una por tienda), ventas del día
  - [x] Migración `pos_cash_and_payments` (índice único parcial de caja abierta, `payments.cash_received`, CHECK)
  - [x] lint + typecheck + tests · commits (`feat(ui)` y `feat(sales)`)
- [x] **Ajuste v0.4 – 1 tienda + bodega** (commit `refactor(demo)`)
  - [x] Seed sin Providencia ni usuario Bodega; 2.ª vendedora en Rancagua; stock redistribuido (tabla de casos abajo)
  - [x] `max_seller_discount_bps = 0` sin marca `is_demo_value`; el POS bloquea todo descuento de la vendedora ("Requiere aprobación de Belén")
  - [x] Caja compartida (RN-29): test de venta en la caja abierta por otra vendedora
  - [x] Matriz de stock con columnas de las ubicaciones activas; sin referencias fijas a Providencia
  - [x] Tests: acceso cruzado Vendedora Rancagua → BODEGA; test de N ubicaciones (tienda extra creada dentro del test)
- [x] **Etapa 4 – Traslados** (en la UI se llaman "Traslados"; en el código y el modelo, `transfers`)
  - [x] `InventoryService`: `updateTransferDraft`, `cancelTransfer` y `resolveTransferDifference` (RN-30) + comandos idempotentes; consultas de bandejas, detalle, contadores y búsqueda
  - [x] Crear (escaneo/búsqueda, sin validar stock al agregar) → editar/anular borrador → Enviar → EN_TRANSITO (Rancagua ↔ Bodega) + guía imprimible A4
  - [x] Bandejas "Por enviar", "Por recibir", "Con diferencias" (solo Belén) e "Historial"; alerta de tránsito (`transfer_transit_alert_days`, calculada al mostrar, sin job); contador en el menú
  - [x] Recibir escaneando (guía a la vista) → RECIBIDO / RECIBIDO_CON_DIFERENCIAS; prenda ajena rechazada
  - [x] Belén resuelve diferencias por línea (MERMA / REENVIO / ERROR_ENVIO) → CERRADO
  - [x] Matriz de stock "En tránsito" verificada (total = físico + tránsito se mantiene al enviar y recibir) y kardex con enlace al traslado
  - [x] Sin migración de esquema (solo la fila `transfer_transit_alert_days` en el seed) · tests de acceso cruzado · lint + typecheck + tests · commit
- [x] **Etapa 5 – Pedido online desde BODEGA** (une las antiguas 5a y 5b; un commit por hito)
  - Reglas (ADR-004 v3, RN-07): **se aparta al pagar**. Al registrar el pedido no se reserva nada: solo se muestra el disponible. Al confirmar el pago se reserva en BODEGA, o en la tienda con traslado a bodega si en bodega no hay. Las reservas nacen firmes: **sin vencimientos** ni job de expiración (`expires_at` queda nulo).
  - **Hito 1 – Pedido desde bodega**
    - [x] Registro (clienta, líneas, despacho) mostrando solo el disponible, sin reservar
    - [x] Confirmar pago → reserva en BODEGA (si falta stock, se avisa: R-17) + `Sale` canal INSTAGRAM en BODEGA (sin mover stock)
    - [x] Bodega (Belén con rol ADMIN): "Listo para preparar" → picking escaneando → PREPARADO (`VENTA_ONLINE`) → Despachar → Entregado
    - [x] Despacho **solo por courier**: Starken, Blue Express y Chilexpress como lista configurable (`settings.couriers`) + N.º de seguimiento
    - [x] Tablero de pedidos por estado
    - [x] Cancelar (PENDIENTE_PAGO, LISTO_PARA_PREPARAR, PREPARADO) con motivo; la `Sale` queda intacta con "reembolso pendiente"
    - [x] POS: el aviso de unidad reservada nombra el pedido
    - [x] Migración `online_orders` (ver "Decisiones del usuario (Etapa 5)") · lint + typecheck + tests · commit
  - **Hito 2 – Apartar en la tienda y traslado automático**
    - [x] Si bodega no tiene para la línea completa: mostrar la tienda con stock y Belén la elige al confirmar el pago
    - [x] Confirmar pago → reserva en la tienda + traslado automático tienda → bodega (ESPERANDO_TRASPASO → LISTO_PARA_PREPARAR)
    - [x] El traslado del pedido aparece en "Por enviar" de la tienda (se envía, no se edita); recibirlo en bodega crea la reserva firme y avanza el pedido solo
    - [x] Traslado con diferencia: el pedido queda bloqueado hasta que Belén resuelve (MERMA / REENVIO / ERROR_ENVIO) · "Completar faltante"
    - [x] Cancelar en `ESPERANDO_TRASPASO` (traslado en borrador, en tránsito o recibido con diferencias)
    - [x] lint + typecheck + tests · commit
  - **Fuera de la demo:** el **retiro en tienda** (EN_CAMINO_A_TIENDA → LISTO_PARA_RETIRO) queda pendiente de P-11 (¿hay retiro y dónde?).
- [x] **Etapa 6 – Aprobación remota**
  - [x] Caso principal: **descuento de la vendedora** (límite 0 %, solo Belén da descuentos) → solicitud, caja en espera (polling ~3 s)
  - [x] **Anulación de venta del mismo día** (RN-12): la pide la vendedora, se ejecuta sola al aprobarse (`ANULACION_VENTA`); el efectivo sale de la caja abierta
  - [x] Reembolso de un pedido cancelado: lo registra Belén directamente (la `Sale` pasa a `ANULADA`)
  - [x] Vista móvil `/aprobaciones` (contador en el menú, refresco ~3 s)
  - [x] Aprobación presencial con PIN ("Belén está aquí")
  - [x] Aprobación de uso único (tipo, ubicación, monto y carrito/venta) + tests
  - [x] Migración `approvals` · lint + typecheck + tests + build · commit
- [x] **Etapa 6.5 – Reportes y dashboard (objetivo específico 4)** · propuesta de demo: lo que quiere ver Belén sigue abierto (P-24) y cada supuesto está listado abajo
  - [x] Módulo `reports` (solo lectura, solo ADMIN) y `/reportes` con tarjetas hoy/semana/mes y una pestaña por reporte
  - [x] Ventas por medio de pago (día/semana/mes, rango, canal, ventas y ticket promedio) · Más vendidos · Stock bajo · Sin rotación · Lista del viernes (imprimible)
  - [x] Historial de demo de 8 semanas por los servicios reales (`pnpm db:seed:history`)
  - [x] Sin migración de esquema: los umbrales son 3 filas nuevas en `settings` · lint + typecheck + tests + build · commit
- [x] **Etapa 7 – Pulido para presentar y publicación en Render**
  - [x] Inicio "Guion de demo" (7 pasos con enlaces, usuario y problema que resuelve; solo con `DEMO_MODE`)
  - [x] Botón "Reiniciar datos de demo" (solo ADMIN + `DEMO_MODE`, validado en el servidor) → `resetAndSeedDemoData({ history: true })`
  - [x] Aviso "Demo con datos ficticios" en el login, títulos de página, menú y tablas legibles en celular
  - [x] README en español y `docs/DEPLOY_RENDER.md`
  - [x] `render.yaml` (raíz del repositorio), `/api/health` y `pnpm demo:bootstrap` (siembra solo si la BD está vacía)
  - [x] lint + typecheck + tests · commit
- [x] **Etapa 8 – Rediseño visual (dirección D)** · referencia en `docs/DISENO.md`
  - [x] Dirección D elegida (negro, rosado y vino sobre fondo rosado claro); página temporal `/diseno` con las tres direcciones, eliminada al cerrar la etapa
  - [x] Tokens de color y de papel en `globals.css`; tipografías Playfair Display (títulos y marca), Nunito Sans (texto) y Geist Mono (SKU, números de documento y ticket)
  - [x] Riel lateral abierto por defecto (preferencia guardada) y menú móvil; tablas que pasan a tarjetas en celular donde corresponde
  - [x] Pantallas rediseñadas por tandas: base, Stock y kardex, Pedidos y traslados, Reportes y aprobaciones, POS y caja
  - [x] Ya no quedan clases de color sueltas de Tailwind fuera de los tokens; el ticket, las guías y la lista del viernes usan tokens de papel
  - [x] Accesibilidad: contraste AA con test automático (33 casos), foco visible, objetivos táctiles de 44 px, movimiento reducido
  - [x] `ConfirmDialog` (`components/ui/confirm-dialog.tsx`) reemplaza los 12 `window.confirm` nativos
  - [x] Verificación: 37 rutas a 1440 y 375 px, impresión (7 documentos idénticos a antes de los tokens), los 7 pasos del guion, `pnpm build` y `pnpm start` con y sin `DEMO_MODE`
  - [x] lint + typecheck + tests (389) + build · commits

## Estructura de carpetas (todo dentro de `big-curvas/`)

```
big-curvas/
  docker-compose.yml  .env.example  .gitignore  README.md  render.yaml (etapa 7)
  prisma/  schema.prisma  migrations/  seed.ts
  docs/    (existentes + DEMO_PLAN.md)
  src/
    app/                       # solo UI y adaptadores
      layout.tsx  page.tsx     # inicio / guion de demo
      login/                   # DEMO: "Entrar como…"
      stock/  stock/[variantId]/kardex/
      pos/  pos/ticket/[saleId]/  pos/caja/
      traspasos/
      pedidos/                 # tablero, nuevo/editar, detalle, pagar, preparar, despachar
      aprobaciones/            # vista móvil
    modules/
      auth/  locations/  catalog/  inventory/ (⭐)  sales/  approvals/  orders/  customers/
      # cada uno con index.ts como API pública; Prisma solo aquí dentro
    lib/  db.ts  money.ts  dates.ts  errors.ts  access.ts  idempotency.ts
    components/  ui/ (shadcn)  layout/
  tests/  integration/ (Postgres real)
```

`returns/`, `suppliers/`, `billing/` quedan fuera de la demo. `reports/` entró en la Etapa 6.5 (solo lectura).

## Subconjunto del modelo Prisma

Tablas pedidas: `locations, users, categories, sizes, colors, products, product_variants, stock_levels, inventory_movements, reservations, transfers, transfer_lines, cash_sessions, sales, sale_lines, payments, approval_requests, customers, online_orders, online_order_lines`.
Nombres de columnas y enums exactamente como `docs/04_MODELO_DE_DATOS.md` (modelos Prisma en PascalCase con `@@map` a `snake_case` plural, campos con `@map`).

**Recortes respecto al doc** (campos que no se usan en la demo): `pos_device_id`, `sii_branch_code`, `pin_hash`/`password_hash`/`failed_pin_attempts`/`locked_until`, `images`, `price_override`/`cost_override` se mantienen como nullable pero sin uso, `is_contingency`, `tax_doc_*`, `void_*`, `picked_up_by_rut`.

**Adiciones propuestas (a confirmar):**
- `settings` (clave/valor tipado; `max_seller_discount_bps`, `approval_timeout_minutes`; `couriers` en la Etapa 5), porque el límite de descuento debe ser configurable. `reservation_ttl_hours` se quitó en v0.4 (no hay vencimiento de reservas).
- `audit_log` (regla 9: acciones sensibles).
- `document_counters` (correlativos atómicos: `RGA-000001`, `TR-000001`, número de pedido).
- Constraints en el SQL de la migración (Prisma no los soporta nativamente): `CHECK on_hand >= 0`, `reserved >= 0`, `reserved <= on_hand`, `quantity > 0`, `from_location_id <> to_location_id`, `role = 'ADMIN' OR location_id IS NOT NULL`, y un **trigger que bloquea UPDATE/DELETE en `inventory_movements`** (regla 2).

## Dependencias

Del stack definido: `next`, `react`, `typescript`, `tailwindcss`, shadcn/ui (trae `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`), `prisma` + `@prisma/client`, `zod`, `vitest`, `react-hook-form` + `@hookform/resolvers`, ESLint.

**Necesitan tu OK (fuera de la lista literal):**
1. `tsx` (dev) – ejecutar `prisma/seed.ts` y scripts.
2. Driver de Postgres para Prisma (`@prisma/adapter-pg` + `pg`) si la versión estable de Prisma lo exige (Prisma 7); se decide al instalar.
3. `dotenv` (dev) – solo si `process.loadEnvFile()` de Node 24 no basta para Vitest/seed (intento evitarla).

**No se instalan en la demo:** Playwright, TanStack Table, Better Auth, `bwip-js`, Recharts, exceljs.

## Decisiones de diseño tomadas (avisar si no te calzan)

- "Tiempo real" = auto-refresco por polling (~3 s) en Stock y bandejas; sin websockets.
- `getCurrentUser()` en `src/modules/auth` lee una cookie `// DEMO:`; devuelve `{ id, name, role, locationId }`. El ADMIN elige "tienda activa" con un selector (cookie) para operar POS/traspasos.
- `requireAccess({ roles, locationId })` en `src/lib/access.ts`; toda Server Action lo usa. Consultas de stock de otras ubicaciones son lectura, sin `locationId`.
- Idempotencia: la operación (venta, traspaso, pedido) lleva `idempotencyKey` único; cada movimiento deriva `"{key}:{n}"` único.
- El InventoryService se amplía con operaciones auxiliares que el contrato implica pero no lista: `createTransfer`, `updateTransferDraft`, `cancelTransfer`, `resolveTransferDifference` (el §5 sí la define; recibe un arreglo de `{lineId, resolution}` para poder crear un solo borrador de reenvío), consultas de stock/tránsito.
- Pruebas contra una BD `big_curvas_test` en el mismo contenedor Docker (migrada por el `globalSetup` de Vitest).
- **Concurrencia (Etapa 2, aprobado):** cada cambio de stock es un UPDATE/UPSERT condicional con `RETURNING` (`src/modules/inventory/stock-sql.ts`, único archivo que escribe `stock_levels`), en READ COMMITTED. Orden global de bloqueo: traspaso → reservas → `stock_levels`, siempre por `(location_id, variant_id)`. Los cambios de estado de reservas y traspasos también son condicionales (`WHERE status = …`).
- **Idempotencia (Etapa 2):** `runIdempotent` (`src/lib/idempotency.ts`) busca por clave → ejecuta la `$transaction` → ante cualquier error (P2002 incluido) relee FUERA de la transacción. Movimientos `{clave}:{n}` con n = índice de la línea ya ordenada. Comandos de UI con transacción propia: `receiveStock`, `adjustStock`, `createTransferCommand`, `sendTransferCommand`, `receiveTransferCommand`; `sell`/`reserve`/`consumeReservations` los llama sales/orders con su `tx`.
- Reservas y consumos se exponen en plural (`releaseReservations`, `consumeReservations`) para ordenar y bloquear varias reservas en una sola operación.
- Puerto Postgres local: 5432 (libre hoy).

## Respuestas del usuario a las dudas (Etapa 0 aprobada)

> **Actualizado por v0.4 (2026-10-02):** el punto 1 (10 %) pasó a **0 %** confirmado; el punto 4 (retiro en tienda) queda fuera de la demo (P-11); el punto 5 ahora es regla de negocio (ADR-004 v3: se aparta al pagar, sin vencimientos). Ver "Cambios v0.4" al final.

1. Límite de descuento: **10 % por línea**, guardado en `settings` y marcado como valor de demo. P-08 sigue pendiente con el cliente.
2. Redondeo $10: 1–5 baja, 6–9 sube. **Pendiente validar con el contador.**
3. Venta online al pagar: SÍ (RN-13). `Sale` INSTAGRAM en BODEGA al confirmar el pago, sin mover stock; el stock baja al preparar (`VENTA_ONLINE`).
4. Retiro en tienda: flujo completo; "quién retira" = campo de nombre simple.
5. Vencimiento de reservas y cancelación de pedidos: fuera de la demo (se guarda `expires_at`, sin job).
6. Migración: pausa aprobada; mostrar SQL + resumen en palabras simples (tablas, constraints, trigger) antes de aplicar.

Dependencias: OK `tsx`; `@prisma/adapter-pg` + `pg` solo si Prisma 7 los exige; `dotenv` solo si `process.loadEnvFile()` no alcanza. Tablas `settings`, `audit_log`, `document_counters`, CHECKs y trigger aprobados. Etapa 5 dividida en 5a/5b.

### Dudas originales (referencia)

1. **Límite de descuento (P-08):** el doc dice 0 % por defecto. Propongo **10 %** para la demo, por línea, en `settings`. ¿OK?
2. **Redondeo a $10 (Ley 20.956):** implemento 1–5 → decena inferior, 6–9 → superior. Validar con el contador.
3. **Venta online al pagar (RN-13):** al confirmar el pago creo una `Sale` canal INSTAGRAM en BODEGA (sin tocar stock; el stock baja al preparar). ¿La incluyo o la omito en la demo?
4. **Retiro en tienda:** implemento el flujo completo del doc (`EN_CAMINO_A_TIENDA → LISTO_PARA_RETIRO → ENTREGADO`, con quién retira). Tu texto lo resume; ¿lo dejo completo?
5. **Vencimiento de reservas/cancelar pedido:** no se piden en la demo. Guardo `expires_at` pero sin job ni cancelación. ¿OK dejarlo para la Fase 1?
6. **CLAUDE.md prohíbe cambiar `schema.prisma` sin mostrar la migración:** en Etapa 1 generaré la migración con `--create-only`, te mostraré el SQL y esperaré tu aprobación antes de aplicarla (una pausa extra dentro de la etapa).

## Riesgos

- **Render gratis:** el web service se duerme (arranque en frío ~30–60 s) y el Postgres gratuito expira a los 30 días y tiene 1 GB. Despertarlo antes de presentar.
- **Concurrencia:** la garantía real está en el UPDATE condicional + CHECK; los tests concurrentes exigen Postgres real (Docker levantado para `pnpm test`).
- **Prisma / Next recientes:** versiones mayores pueden cambiar configuración (`prisma.config.ts`, adapters). Se usará la última estable y se documentará.
- **Login demo sin contraseña** con cookie sin firmar: solo válido con `DEMO_MODE=true`; jamás en producción real.
- **Alcance:** la Etapa 5 (pedido online) es la más grande; se mantiene en una sola etapa con dos hitos (pedido desde bodega / apartar en tienda + traslado) y un commit por hito.

## Pendientes para Fase 1

- **PIN de la vendedora (RN-29):** en la caja compartida cada venta debe identificar a la vendedora con su PIN. En la demo se identifica con "Entrar como…"; el PIN llega con la autenticación real (Fase 1).
- En producción, el usuario de BD de la app no debe tener permiso `TRUNCATE` sobre `inventory_movements` (el trigger de solo-INSERT no cubre TRUNCATE; en la demo se permite para reiniciar datos y para los tests).
- Validar con el contador el redondeo de efectivo a $10 (1–5 baja, 6–9 sube).
- ~~P-08~~ resuelto en v0.4: solo Belén da descuentos; el límite de la vendedora es 0 % (`settings`, sin `is_demo_value`). El flujo de aprobación se hizo en la Etapa 6.
- ~~Cancelación de pedidos online~~ hecha en la Etapa 5 (la `Sale` queda con "reembolso pendiente" hasta que Belén registra el reembolso, Etapa 6). Vencimiento de reservas: **no aplica** (ADR-004 v3).
- Extraer el registro de auditoría (`audit_log`) a un módulo propio cuando haya más acciones sensibles (hoy lo escribe `inventory.adjust`).
- Validar el acceso (rol/ubicación) antes de la validación de datos de entrada (hoy InventoryService valida primero con Zod, así que un dato inválido responde `VALIDATION` antes que `FORBIDDEN`).
- Definir el manejo de prendas no incluidas en un traslado (P-23, pendiente con el cliente). En la demo se rechazan al recibir: "Esta prenda no viene en el traslado. Sepárala y avisa a Belén".
- **Idempotencia de `resolveTransferDifference` con restricción única en BD.** Hoy la clave de la operación se guarda en `audit_log.after` (consulta por JSON, sin índice único) porque una MERMA no deja movimiento de stock; la garantía real contra la doble resolución es el cambio condicional de la línea (`difference_resolution IS NULL`) y del traslado (`status = RECIBIDO_CON_DIFERENCIAS`). Para Fase 1: tabla o columna con `UNIQUE (idempotency_key)`.
- **Evaluar con Belén (P-28):** la recepción **a ciegas** (hoy la vendedora ve la cantidad enviada al recibir) y una resolución "error de recepción" para sobrantes (se escaneó de más en destino); hoy un sobrante solo admite `ERROR_ENVIO` (RN-30).
- El traslado de `REENVIO` queda ligado al original solo por texto (`resolution_notes` del borrador y `audit_log`); no hay columna `parent_transfer_id`.
- Tras completar faltante, una línea puede quedar repartida entre ubicaciones y su `source_location_id` queda con la primera; en Fase 1, registrar el origen por reserva y no por línea.
- Confirmar con el cliente si la caja se cierra diariamente y qué hacer ante diferencias (¿aprobación de Belén?).
- Redondeo de efectivo a $10 y numeración de ventas siguen pendientes de validar con el contador / cliente (ver arriba).
- Pagos mixtos, vales, cambios/devoluciones, anulaciones, promociones y SII quedan fuera de la demo.
- Direcciones de las tiendas del ticket son datos de ejemplo del seed; el ticket dice "Comprobante interno – no válido como boleta".

## Decisiones del usuario (Etapa 2)

1. Prenda que no viene en el traslado: en la demo se **rechaza** al recibir con el mensaje "Esta prenda no viene en el traslado. Sepárala y avisa a Belén" (desde la Etapa 4 el texto dice "traslado"). Regla pendiente de confirmar con el cliente. Si llegan más unidades de una prenda que sí venía, se aceptan y quedan como diferencia.
2. Confirmado: `sell` solo en ubicaciones con POS (`sells_pos`). La bodega descuenta únicamente vía `consumeReservations`.

## Advertencia técnica: índice parcial de caja

`cash_sessions_one_open_per_location_idx` (índice único parcial `WHERE status = 'ABIERTA'`) vive solo en el SQL de la migración `20260930055539_pos_cash_and_payments`: **Prisma no lo conoce**. En cada migración futura hay que revisar el SQL generado y **quitar cualquier `DROP INDEX` de ese índice** antes de aplicarla. Lo mismo vale para los CHECK y el trigger de `inventory_movements`.

## Decisiones del usuario (Etapa 3)

1. **Paleta:** negro `#0A0A0A`, rosado `#F5C6D6`, rosado intenso `#E0507F` (hover y foco; el propuesto `#E56A98` daba 2,9:1 de anillo de foco sobre blanco), fondo de trabajo `#FFF5F8`, énfasis sobre claro `#9D1F52`. Sin modo oscuro. El rosado claro nunca va como texto sobre fondo claro. Provisional hasta tener el color exacto del logo (solo cambian los cinco `--brand-*`).
2. **Cierre de caja con diferencia:** se permite, con observación obligatoria si la diferencia ≠ 0 (queda en `audit_log`). El conteo es "ciego": la vendedora ingresa lo contado y el sistema muestra esperado y diferencia al cerrar.
3. **Caja que cruza días:** sigue abierta hasta cerrarse; "Ventas del día" filtra por fecha de la venta en `America/Santiago`.
4. **Ticket:** nombre y dirección de la tienda + texto "Comprobante interno – no válido como boleta".
5. **Efectivo esperado** = monto inicial + Σ pagos en efectivo (cada `payments.amount` ya es neto de vuelto y trae el redondeo). Vuelto = `cash_received − amount`.
6. **Concurrencia de caja:** la venta bloquea la caja con `FOR SHARE`; el cierre con `FOR UPDATE` espera a las ventas en curso y las siguientes ya no encuentran caja abierta. El correlativo (`SALE:{prefijo}`) se toma al final de la transacción: un rollback no deja huecos.
7. **Descuento sobre el límite:** según `02_REQUERIMIENTOS.md` §1, el ADMIN puede superarlo sin aprobación y la VENDEDORA no ("Requiere aprobación de Belén"; flujo en la Etapa 6). Cuando el ADMIN lo supera se guarda en `audit_log` (`DISCOUNT_OVERRIDE`: usuario, venta, N° de venta, límite y % por línea).

## Cambios v0.4 (2026-10-02, reunión con la clienta)

1. **Una tienda + bodega** (ADR-017): solo `TIENDA_RANCAGUA` y `BODEGA`. El modelo sigue siendo multi-ubicación; un test crea una tienda extra solo dentro del test.
2. **Belén opera la bodega con su rol ADMIN.** El rol BODEGA se mantiene en el código, sin usuario en la demo (los tests crean uno propio para probar el rol).
3. **Solo Belén da descuentos** (RN-09): `max_seller_discount_bps = 0`, valor confirmado. Todo descuento de una vendedora queda bloqueado con "Requiere aprobación de Belén" hasta la Etapa 6. El ADMIN puede darlos y, si superan el límite, quedan en `audit_log` (`DISCOUNT_OVERRIDE`).
4. **Caja compartida** (RN-29): la abre cualquier vendedora, venden todas en ella y cada venta registra a quien la hizo (`sales.seller_id`). En la demo la vendedora se identifica con "Entrar como…" (el PIN de RN-29 llega con la autenticación real).
5. **Se aparta al pagar, sin vencimientos** (RN-07, ADR-004 v3). Retiro en tienda fuera de la demo (P-11).

### Usuarios de la demo

| Usuario | Rol | Ubicación |
|---|---|---|
| Belén | ADMIN | Todas (elige dónde opera) |
| Vendedora Rancagua | VENDEDORA | Tienda Rancagua |
| Vendedora 2 Rancagua | VENDEDORA | Tienda Rancagua (comparte la caja) |

### Casos de prueba de stock (seed)

| Caso | SKU | Rancagua | Bodega |
|---|---|---:|---:|
| Última unidad en la tienda (dos ventas simultáneas) | `JMT012-AZU-48` | 1 | 8 |
| Sin stock en la tienda, con stock en bodega (el POS muestra dónde) | `JMT012-NEG-48` | 0 | 6 |
| Alta rotación | `PBA041-NEG-XL` | 5 | 20 |
| Solo en la tienda (pedido online que se aparta en la tienda y se trae a bodega) | `CPU053-NEG-2XL` | 3 | 0 |
| Solo en bodega (traslado Bodega → tienda) | `BLM022-BUR-3XL` | 0 | 5 |
| Poco stock en ambas | `VNE033-NEG-52` | 1 | 2 |

El resto de las variantes tiene stock pseudoaleatorio pero fijo (tienda 0–6, bodega 0 o 4–14).

## Decisiones del usuario (Etapa 4)

1. **Resolución de diferencias (RN-30, propuesta pendiente de validar con Belén: P-28).** Con `d = enviado − recibido`, por línea y solo ADMIN. El destino nunca se toca (ya sumó lo escaneado); todos los reingresos y descuentos son movimientos `AJUSTE` en el **origen** con `ref_type = TRANSFER`.

   | Caso | Resolución | Efecto en stock | Movimiento |
   |---|---|---|---|
   | Faltante (`d > 0`) | `MERMA` | Ninguno (se asume pérdida en el camino) | Ninguno: `inventory_movements` exige `quantity <> 0`. Queda en la línea y en `audit_log`. `MERMA_TRASPASO` queda reservado |
   | Faltante | `REENVIO` | **+d en el origen** (la prenda se quedó) y un **traslado nuevo en BORRADOR** origen → destino con esas prendas | `AJUSTE` +d |
   | Faltante | `ERROR_ENVIO` | **+d en el origen** (la guía anotó de más); sin traslado nuevo | `AJUSTE` +d |
   | Sobrante (`d < 0`) | `ERROR_ENVIO` (la única permitida) | **−\|d\| en el origen** (salió más de lo anotado). Solo del disponible: si no alcanza → `STOCK_INSUFICIENTE` y Belén ajusta antes | `AJUSTE` −\|d\| |

   `MERMA` y `REENVIO` sobre un sobrante → `VALIDATION`. Se puede resolver por partes; el traslado pasa a `CERRADO` cuando todas las líneas con diferencia tienen resolución. Resolver una línea ya resuelta → `CONFLICT`.
2. **Mensajes con "traslado"** (UI y errores); el mensaje de la prenda ajena queda igual salvo esa palabra. Un test existente (`inventory-transfers.test.ts`) se actualizó solo por este cambio de texto.
3. **Recepción con la guía a la vista** (no a ciegas): ver pendientes (P-28).
4. **Belén elige la ubicación en "Operando en"** para ver las bandejas y crear traslados; el destino es siempre "la otra" ubicación. Sin ubicación elegida ve las bandejas de todas.
5. **Borradores con líneas ligadas a pedidos** (reservas, Etapa 5) no se editan ni se anulan desde esta pantalla. Editar un borrador reescribe sus líneas (no tienen efecto en ningún saldo).
6. **Anular** un borrador queda en `audit_log` (`TRANSFER_CANCEL`); anular o editar algo que ya no es borrador → `CONFLICT`.
7. **Impresión:** la guía usa una página con nombre (`@page guia`, A4); el ticket pasó a `@page ticket`, con el mismo efecto que antes.
8. **Columna "Por resolver" en la matriz de stock** (solo lectura, sin movimientos): suma los faltantes (`enviado − recibido`) de traslados `RECIBIDO_CON_DIFERENCIAS` sin resolver, de modo que Total = Rancagua + Bodega + En tránsito + Por resolver. Se muestra solo si hay algo pendiente (también en el kardex). `REENVIO` y `ERROR_ENVIO` no cambian el Total; `MERMA` lo baja, y es lo correcto. Los sobrantes no se cuentan en la columna.

## Casos de prueba para la demo (Etapa 4)

Usuarios: Belén (ADMIN) y Vendedora Rancagua (VENDEDORA). Reiniciar los datos con `pnpm db:seed` antes de presentar.

| # | Caso | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | **Bodega → tienda con un faltante** (caso principal) | Belén: "Operando en: Bodega" → Traslados → Nuevo traslado → escanear `BLM022-BUR-3XL` (bodega 5), cantidad 3 → Guardar borrador → Enviar → ver la guía. Vendedora Rancagua: contador "Traslados 1" → Por recibir → Recibir → escanear 2 unidades → Confirmar | `TR-000001` queda `Recibido con diferencias` (faltan 1). Stock: Bodega 2, Rancagua 2, en tránsito 0 |
| 2 | **Resolver el faltante** | Belén: contador del menú → "Con diferencias" → TR-000001 → elegir una resolución → Resolver | `REENVIO`: Bodega 3 + borrador nuevo `TR-000002` de 1 unidad; `ERROR_ENVIO`: Bodega 3 sin borrador; `MERMA`: sin cambios (Bodega 2). En los tres, `TR-000001` queda `Cerrado` y el kardex muestra el `Ajuste` con enlace al traslado |
| 3 | **En tránsito en la matriz** | Tras enviar el caso 1 y antes de recibir, abrir Stock y buscar `BLM022-BUR-3XL` | Rancagua 0 · Bodega 2 · En tránsito 3 · Total 5 |
| 3b | **Por resolver en la matriz** | Tras recibir con faltante (caso 1) y antes de resolver, abrir Stock y buscar `BLM022-BUR-3XL` | Aparece la columna "Por resolver" con 1: Rancagua 2 · Bodega 2 · En tránsito — · Por resolver 1 · Total 5. Al resolver con `REENVIO`/`ERROR_ENVIO` el Total sigue en 5 y la columna desaparece; con `MERMA` el Total baja a 4 |
| 4 | **Prenda ajena** | Al recibir, escanear `PBA041-NEG-XL` | "Esta prenda no viene en el traslado. Sepárala y avisa a Belén." y no suma |
| 5 | **Tienda → bodega** | Vendedora Rancagua: Nuevo traslado (origen = su tienda) con `PBA041-NEG-XL` ×2 → Enviar. Belén (Operando en: Bodega) → Por recibir → Recibir | `Recibido`; Rancagua 3, Bodega 22 |
| 6 | **Sobrante** | Enviar `BLM022-BUR-3XL` ×2 desde la bodega y escanear 3 en la tienda; Belén resuelve | Solo ofrece "Error de envío": baja 1 de la bodega y el traslado queda `Cerrado` |
| 7 | **Sin disponible** | Con 3 unidades de `BLM022-BUR-3XL` reservadas en bodega (pedido online, Etapa 5), enviar 3 | "Stock insuficiente… disponible 2 (3 reservadas…)"; el borrador sigue como borrador |
| 8 | **Permisos** | La vendedora intenta editar un borrador de la bodega y entra a "Con diferencias" | El servidor rechaza (`FORBIDDEN` / `/sin-acceso`); la pestaña y el panel de resolución no existen para ella |
| 9 | **Alerta de tránsito** | Con un traslado en tránsito, bajar `transfer_transit_alert_days` en la tabla `settings` (o esperar más de 3 días) | Marca roja "N días en tránsito" en la bandeja y en el detalle |

## Decisiones del usuario (Etapa 5)

1. **Envío en la venta (P-11 / P-29).** `sales.shipping_cost` (Int ≥ 0; 0 en POS) y `total = subtotal − descuento + envío` (CHECK en `sales` y `online_orders`). El pago es `total` (+ `rounding_adjustment` si es efectivo): `SUM(payments) = total + rounding_adjustment` se mantiene. El envío se ingresa a mano. El IVA del envío queda pendiente con el contador (**P-29**). `priceOrder` vive en `sales/pricing.ts`.
2. **Cancelar un pedido pagado.** Libera las reservas (o reingresa a bodega si ya estaba `PREPARADO`, `REINGRESO_PEDIDO_CANCELADO`). La `Sale` **no se toca** (regla 10b: anular exige aprobación, Etapa 6); el detalle muestra "reembolso pendiente" (pedido cancelado con venta `COMPLETADA`). `DESPACHADO` y `ENTREGADO` no se cancelan (se gestionan como devolución).
3. **Esquema (migración `20261013120000_online_orders`).** `customers.address/commune`; `settings.value_text` (con `value_int` nulable y CHECK de que haya uno); `online_order_lines.discount_bps` y `UNIQUE (order_id, variant_id)` (la UI suma la cantidad si se agrega la misma variante); `online_orders.cancelled_at/cancelled_by/cancel_reason`; `sales.shipping_cost`; tabla `online_order_events` (historial de estados + `idempotency_key` UNIQUE, solo INSERT con trigger). `cash_sessions_one_open_per_location_idx` se verificó intacto.
4. **Estados.** `PAGADO` no se persiste (solo vive dentro de la transacción de confirmar). Cada cambio de estado es `UPDATE … WHERE status IN (…)`; si no afecta filas → `CONFLICT`. La idempotencia de confirmar, preparar, despachar, entregar y cancelar es el evento del historial con `idempotency_key` UNIQUE.
5. **Orden de bloqueo global:** pedido → traslados → reservas → stock.
6. **Picking.** Se escanea en el navegador (rechazo inmediato de prenda ajena o de más) y se confirma una vez; el servidor exige que lo escaneado coincida exacto con el pedido. Belén debe tener "Operando en: Bodega" para preparar y despachar.
7. **Menú.** "Bodega" desapareció; queda "Pedidos" con el contador de pedidos por preparar. Preparar y despachar viven en `/pedidos/[id]/preparar` y `/despachar`.
8. **Descuentos de Belén en pedidos** sobre el límite de la vendedora quedan en `audit_log` (`DISCOUNT_OVERRIDE`, entidad `online_order`), igual que en el POS.
9. **InventoryService:** nuevas `returnOrderToStock` (reingreso de un pedido preparado y cancelado) y `listActiveOrderReservations` (lectura). `reserve`, `releaseReservations` y `consumeReservations` ya existían.

## Casos de prueba para la demo (Etapa 5 – Hito 1)

Usuarios: Belén (ADMIN). Reiniciar los datos con `pnpm db:seed` antes de presentar. Para preparar y despachar, Belén elige "Operando en: Bodega".

| # | Caso | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | **Pedido desde bodega** (caso principal) | Pedidos → Nuevo pedido → Nueva clienta → escanear `PBA041-NEG-XL` → envío $3.990 → Registrar. Confirmar pago (transferencia + referencia). Preparar (escanear la prenda). Despachar (courier + seguimiento). Marcar entregado | `PED-000001` pasa por Pendiente de pago → Listo para preparar → Preparado → Despachado → Entregado. Al registrar nada se aparta; al pagar Bodega queda 20 (1 reservada) y aparece la venta `BOD-000001`; al preparar Bodega baja a 19 con un movimiento `VENTA_ONLINE`. El historial muestra cada paso |
| 2 | **Registrar no aparta** | Registrar un pedido y mirar Stock | Disponible intacto; el detalle dice "Nada (se aparta al pagar)" |
| 3 | **Sin stock al pagar** | Registrar `CPU053-NEG-2XL` (bodega 0) y confirmar el pago | El pago no se registra: "Stock insuficiente de CPU053-NEG-2XL en Bodega…". El pedido sigue pendiente. (El Hito 2 permite apartarlo en la tienda) |
| 4 | **Prenda ajena en el picking** | Preparar y escanear una prenda que no es del pedido | "Esa prenda no es del pedido PED-… Sepárala y no la incluyas." y no suma |
| 5 | **Cancelar pagado** | Cancelar un pedido en Listo para preparar, con motivo | Reservas liberadas; el detalle muestra "Reembolso pendiente" con la venta `BOD-…`. Cancelado después de preparar: Bodega recupera la prenda (`Reingreso pedido cancelado`) |
| 6 | **Despachado no se cancela** | Intentar cancelar un pedido despachado (por la UI el botón no aparece; el servidor responde `CONFLICT`) | "…ya salió de la bodega y no se cancela (se gestiona como devolución)." |
| 7 | **Aviso del POS** | Con una unidad de la tienda reservada para un pedido (Hito 2), la vendedora escanea esa prenda | "…1 unidad reservada para el pedido PED-…" |
| 8 | **Permisos** | La vendedora entra a `/pedidos` | `/sin-acceso`; el servidor rechaza registrar, confirmar, preparar, despachar y cancelar |

### Decisiones del Hito 2 (Etapa 5)

1. **La tienda solo se acepta si la bodega no tiene disponible para la línea COMPLETA** (una línea sale de una sola ubicación, sin dividir unidades). Se valida en el servidor (`VALIDATION` si la bodega alcanza) y la pantalla solo ofrece la tienda cuando la bodega no alcanza. Cada línea guarda `source_location_id`.
2. **Traslado automático.** Al confirmar el pago, las líneas apartadas en una tienda generan un traslado tienda → bodega (`PEDIDO_ONLINE`, ligado al pedido, a las líneas y a sus reservas) en `BORRADOR`, y el pedido queda `ESPERANDO_TRASPASO`. Aparece en "Por enviar" de la tienda; **se envía** (vendedora o Belén) pero no se edita ni se anula desde Traslados. La pantalla del traslado muestra a qué pedido pertenece.
3. **Recibir y resolver pasan por `orders`** (`receiveTransferAndSync`, `resolveTransferAndSync`): bloquean el pedido primero y llaman a InventoryService con el mismo `tx`. Si el traslado no es de un pedido, son exactamente los comandos de inventario de siempre. **Orden de bloqueo global: pedido → traslados → reservas → stock** (cancelar bloquea todos los traslados del pedido con `FOR UPDATE` antes de tocar reservas).
4. **Diferencias de traslado de un pedido (RN-30).** El pedido queda en `ESPERANDO_TRASPASO` bloqueado (aviso) hasta que Belén resuelve todo, incluso si es sobrante. Después:

   | Resolución | Stock | Pedido |
   |---|---|---|
   | Faltante + `REENVIO` | +d en la tienda | Esas d unidades se vuelven a apartar para el pedido y el borrador de reenvío nace ligado a él (`PEDIDO_ONLINE`). Sigue en `ESPERANDO_TRASPASO`, sin bloqueo; al recibir el reenvío → `LISTO_PARA_PREPARAR` |
   | Faltante + `MERMA` | Ninguno | Queda con faltante: "Completar faltante" o cancelar |
   | Faltante + `ERROR_ENVIO` | +d en la tienda (libres) | Igual que MERMA, con las unidades libres en la tienda |
   | Sobrante + `ERROR_ENVIO` | −\|d\| en la tienda | Se desbloquea y, con todo reservado en bodega, pasa a `LISTO_PARA_PREPARAR` |

5. **Completar faltante** (solo ADMIN, `ESPERANDO_TRASPASO` sin diferencias por resolver): aparta lo que falta con las mismas reglas de confirmar pago (bodega, o tienda si la bodega no alcanza para lo que falta, con un traslado nuevo). Si todo queda en bodega → `LISTO_PARA_PREPARAR`. Tras completar desde la tienda, una línea puede quedar repartida entre bodega y tienda (su `source_location_id` no se actualiza; el detalle muestra las reservas por ubicación).
6. **Cancelar en `ESPERANDO_TRASPASO`** (InventoryService `cancelOrderTransfers`): traslado en `BORRADOR` → `ANULADO` y reserva liberada; `EN_TRANSITO` o recibido con diferencias → las líneas se **desligan** del pedido, así que al llegar a bodega la prenda queda libre (y una resolución posterior ya no toca el pedido). Las reservas activas (tienda y bodega) se liberan. La `Sale` queda con "reembolso pendiente".
7. **Pedido en tránsito.** El detalle muestra "En camino a bodega: N" (calculado) y "Faltan N" cuando una línea no está cubierta por reservas ni traslados.

## Casos de prueba para la demo (Etapa 5 – Hito 2)

Usuarios: Belén (ADMIN) y Vendedora Rancagua. Reiniciar los datos con `pnpm db:seed` antes de presentar.

| # | Caso | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | **Pedido que sale de la tienda** (caso principal) | Belén: Nuevo pedido con `CPU053-NEG-2XL` (bodega 0, tienda 3) → Confirmar pago: en el aviso "La bodega no alcanza", elegir **Apartar en Tienda Rancagua** → transferencia con referencia. Vendedora Rancagua: Traslados → Por enviar → `TR-000001` → **Enviar traslado**. Belén: Traslados → Por recibir → Recibir escaneando la prenda → Confirmar. Belén: Pedidos → Preparar | Al pagar: pedido `Esperando traslado`, tienda con 1 reservada (el POS solo vende las no reservadas y el aviso dice "reservada para el pedido PED-…"). Al enviar: la tienda baja su físico. Al recibir: bodega 1 con 1 reservada y el pedido pasa solo a `Listo para preparar`. Al preparar: bodega 0 con movimiento `VENTA_ONLINE` |
| 2 | **La bodega alcanza, no se usa la tienda** | Pedido de `PBA041-NEG-XL` (bodega 20) | El selector de tienda no aparece; el servidor rechaza apartar en la tienda si se fuerza |
| 3 | **Traslado del pedido con faltante** | Pedido de 3 × `CPU053-NEG-2XL` desde la tienda; enviar; recibir escaneando solo 2 | Traslado `Recibido con diferencias`; el pedido sigue en `Esperando traslado` con aviso "Pedido bloqueado". Belén: Traslados → Con diferencias → resolver (`Reenvío`: el pedido espera el reenvío ligado `TR-…`; `Merma`/`Error de envío`: el pedido muestra "Faltan 1" y el panel **Completar faltante**) |
| 4 | **Completar faltante** | Tras una merma, con stock en la tienda: Completar faltante → Apartar en Tienda Rancagua | Nuevo traslado ligado al pedido; al recibirlo, `Listo para preparar` |
| 5 | **Cancelar esperando traslado** | Cancelar el pedido con el traslado en borrador / en tránsito | Borrador: traslado anulado y reserva liberada. En tránsito: al recibirlo en bodega la prenda queda libre (sin reserva). El pedido muestra "Reembolso pendiente" |
| 6 | **Permisos** | La vendedora abre el traslado del pedido | Puede enviarlo; no tiene "Editar o anular"; no recibe en bodega ni resuelve diferencias (`FORBIDDEN`) |

## Decisiones del usuario (Etapa 6)

1. **Aprobación ligada a lo aprobado (binding).** `approvals` es genérico: quien pide (`sales`) calcula un SHA-256 y un monto. Descuento: huella de las líneas `{variantId, qty, discountBps}` ordenadas + monto = descuento total en CLP con los precios vigentes. Anulación: huella de la venta + monto = lo cobrado. Al usarla se recalculan y deben coincidir. El medio de pago no forma parte del binding. Cambiar prendas, cantidades, % o un precio invalida la aprobación (el POS la descarta al instante y el servidor lo comprueba igual).
2. **Uso único y transaccional.** Un `UPDATE` condicional exige `APROBADA`, no vencida, mismo tipo, ubicación, monto y binding, y la deja `USADA` **en la misma transacción** que la venta o la anulación (si esa falla, la aprobación sigue disponible). Si no afecta filas, una lectura explica el motivo (usada, rechazada, vencida, otra ubicación, carrito cambiado). Dos usos simultáneos: gana uno.
3. **Vigencia.** La solicitud pendiente vence a los `approval_timeout_minutes` (10, valor de demo) **de creada**; la aprobada, a los mismos minutos **desde la decisión**. Sin job: se evalúa al consultar y al decidir (`expireStale`, con el reloj de la BD). Aprobar o rechazar dos veces, o decidir una vencida, es `CONFLICT`.
4. **Idempotencia.** Crear la solicitud: `idempotency_key` de la tabla. Aprobar, rechazar y PIN: fila de `audit_log` (`APPROVAL_DECISION`) con la clave. Venta y anulación: sus propias claves.
5. **PIN presencial (RF-AUT-05).** En "Belén está aquí" se elige a la administradora y se ingresa **su** PIN: los fallos cuentan solo para esa persona. Hash **scrypt** de Node (sin dependencias nuevas), comparación de tiempo constante. **PIN de demo de Belén: `2468`** (seed, `// DEMO:`; la pantalla lo muestra como pista solo con `DEMO_MODE`). Bloqueo a los **5 fallos por 15 min** (`settings.pin_max_attempts` / `pin_lock_minutes`, valores de demo). El acierto reinicia el contador; un bloqueo vencido se limpia solo. Fallos y bloqueos quedan en `audit_log` (`PIN_FAILED`, `PIN_LOCKED`). La aprobación queda con método `PIN`.
6. **Anulación de venta (RN-12).** Solo ventas POS `COMPLETADA` del **mismo día calendario en hora de Chile** (también para el ADMIN). Una transacción: consume la aprobación (vendedora) → `COMPLETADA → ANULADA` condicional → `InventoryService.reverseSale` (nueva operación: movimiento inverso `ANULACION_VENTA`, nada se borra) → `audit_log` (`SALE_VOID`, con `direct: true/false`). Las ventas online no se anulan por "Ventas del día": su anulación es el reembolso del pedido.
7. **Caja.** Si se pagó en efectivo, el dinero sale de la caja **abierta**; sin caja abierta se rechaza (la aprobación sigue vigente para reintentar). Se guarda `sales.void_cash_session_id`. Efectivo esperado = inicial + efectivo de ventas `COMPLETADA` de la caja − efectivo de ventas de **otra** caja anuladas con esta abierta (`cashRefunded`). Una venta anulada en su propia caja simplemente no cuenta. Tarjeta o transferencia no tocan la caja.
8. **Reembolso de pedido cancelado.** Lo registra Belén directamente (ADMIN, sin solicitud, regla 10b): medio y referencia son **texto libre** (P-17 sigue pendiente). La `Sale` pasa a `ANULADA` (sin mover stock: la cancelación ya lo repuso o liberó) y el aviso desaparece. Queda en `audit_log` (`ORDER_REFUND`, `direct: true`) y en el historial del pedido. Condicional e idempotente: reembolsar dos veces → `CONFLICT`.
9. **Acciones directas del ADMIN** (regla 10b): su descuento (`DISCOUNT_OVERRIDE`), su anulación (`SALE_VOID` directa) y el reembolso (`ORDER_REFUND`) no generan solicitud pero sí `audit_log`. Un descuento aprobado deja `DISCOUNT_APPROVED`.
10. **Esquema (migración `20261021120000_approvals`).** `users.pin_hash / failed_pin_attempts / pin_locked_until`; `sales.voided_at / voided_by / void_reason / void_approval_id (UNIQUE) / void_cash_session_id` y CHECK (`ANULADA` ⇔ `voided_at`); `online_orders.refunded_at / refunded_by / refund_method / refund_reference`; CHECK de monto de aprobación. `cash_sessions_one_open_per_location_idx` se verificó intacto.
11. **Acceso.** Solo ADMIN aprueba, rechaza y ve la bandeja. Solo una VENDEDORA de la ubicación pide aprobaciones (no BODEGA ni ADMIN) y solo consulta las de su ubicación. El PIN lo opera la vendedora de esa ubicación o el ADMIN. BODEGA no anula.
12. **`next.config.ts`: `allowedDevOrigins: ["127.0.0.1"]`** (solo `next dev`): permite abrir la app también por `127.0.0.1` (otro origen = otra cookie), para simular dos ventanas.

## Casos de prueba para la demo (Etapa 6)

Dos ventanas: la **vendedora** en `http://localhost:3000` (caja) y **Belén** en `http://127.0.0.1:3000/aprobaciones` (otro origen = otra sesión; idealmente con la vista móvil del navegador o desde el celular). Reiniciar los datos con `pnpm db:seed` antes de presentar. **Solo la pestaña que está al frente ejecuta el refresco**: tras aprobar, vuelve a la caja y en ~3 s continúa sola. PIN de demo de Belén: **2468**.

| # | Caso | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | **Descuento aprobado** (caso principal) | Vendedora: abrir caja, escanear `PBA041-NEG-XL`, poner 10 % de descuento → "Requiere aprobación de Belén" → **Pedir aprobación a Belén** (con motivo) → "Esperando a Belén…". Belén: `/aprobaciones` → ve la solicitud (prenda, % y monto, motivo, antigüedad) → comentario opcional → **Aprobar** | La caja pasa sola a "Aprobado por Belén (válida una sola vez, vence en 10 min)" y habilita Confirmar. La venta queda con el descuento; la aprobación pasa a `Usada` |
| 2 | **Rechazo** | Igual, pero Belén pulsa **Rechazar** con comentario | La caja muestra "Belén rechazó la solicitud: «…»" y no queda nada a medias; la venta sigue bloqueada |
| 3 | **El carrito cambia** | Con la aprobación recibida, cambiar el % o la cantidad | La aprobación deja de valer ("El carrito cambió: … pide una nueva") y Confirmar se bloquea; si vuelve al carrito original, vuelve a valer. Aunque se fuerce, el servidor la rechaza ("El carrito cambió después de la aprobación") |
| 4 | **Aprobación con PIN** | En la espera, **Belén está aquí** → PIN incorrecto (ej. 0000) → "PIN incorrecto. Quedan 4 intentos" → PIN `2468` | La solicitud queda `Aprobada` con método PIN. Con 5 fallos seguidos el PIN se bloquea 15 min (aun con el correcto) |
| 5 | **Anulación de una venta del día** | Vendedora: Ventas del día → **Anular** → motivo → **Pedir aprobación a Belén**. Belén aprueba (o PIN) | La anulación se ejecuta sola: la venta queda `Anulada` (tachada, con motivo), el stock vuelve (`Anulación de venta` en el kardex) y no suma a los totales. Si fue en efectivo, el dinero sale de la caja abierta (el efectivo esperado se descuenta) |
| 6 | **Anulación en efectivo sin caja abierta** | Cerrar la caja y pedir anular una venta en efectivo | "Abre la caja para anular una venta pagada en efectivo"; la aprobación sigue vigente |
| 7 | **Belén anula directo** | Belén (operando en la tienda): Ventas del día → Anular → motivo → **Anular venta** | Sin solicitud; queda en el registro de auditoría. Solo ventas del mismo día |
| 8 | **Reembolso de un pedido cancelado** | Belén: cancelar un pedido pagado → en el detalle, **Reembolso pendiente** → medio y referencia → **Registrar reembolso** | La venta pasa a `Anulada`, desaparece el aviso y queda "Reembolsado el …" |
| 9 | **Vencimiento** | Esperar más de 10 min sin responder (o bajar `approval_timeout_minutes`) | La solicitud pasa a `Vencida`: la caja informa que venció y Belén ya no puede aprobarla (`CONFLICT`) |
| 10 | **Permisos** | La vendedora abre `/aprobaciones` | `/sin-acceso`; el servidor rechaza que apruebe, rechace o vea la bandeja |

## Decisiones del usuario (Etapa 6.5)

Los reportes los ve solo Belén. Es una **propuesta de demo**: la pregunta P-24 (qué reportes quiere Belén) sigue abierta y los supuestos de abajo se validan con ella.

1. **Módulo y acceso.** `src/modules/reports` solo lee (regla 1; un test compara movimientos, stock, reservas y traslados antes y después). Cada consulta hace `assertAccess(actor, { roles: ["ADMIN"] })` y la página usa `requirePageAccess(["ADMIN"])`; la vendedora y el rol BODEGA son rechazados antes de validar los datos. Sin Server Actions: los filtros son GET.
2. **Fechas.** Todo se agrupa en `America/Santiago` con `src/lib/dates.ts` (se agregaron `santiagoWeekKey`, `santiagoMonthKey`, `startOfDayKeySantiago`, `addDaysToKey`, `daysBetweenKeys`). Una venta a las 23:30 de Chile cae en su día aunque en UTC ya sea el siguiente. Se corrigió `startOfDaySantiago` para el día del cambio de horario de septiembre (la medianoche no existe y el día empieza a la 01:00). Sin `$queryRaw`: se agrupa en JS sobre consultas de Prisma. Rango máximo: 366 días.
3. **Qué cuenta en "ventas" (plata).** Lo cobrado: Σ `payments.amount` de ventas `COMPLETADA` (en efectivo incluye el redondeo a $10; en pedidos online incluye el envío, que se informa aparte). Tarjeta = débito + crédito. Canal tienda = `POS`; online = INSTAGRAM, WHATSAPP o WEB. Fecha de la venta online = `sales.created_at` (al confirmar el pago).
4. **Anuladas.** No cuentan: la venta desaparece del día en que se hizo, aunque se anule o reembolse días después. Se informa aparte "Anuladas en el rango".
5. **Pedidos cancelados con reembolso pendiente (RF-PED-09).** Su venta **sigue contando** en los reportes de plata hasta que Belén registra el reembolso (entonces pasa a `ANULADA` y deja de contar). La tarjeta "Reembolsos pendientes: N · $X" muestra esa plata. Los reportes de **producto** (más vendidos, sin rotación, lista del viernes) **excluyen** las líneas de pedidos `CANCELADO`.
6. **Más vendidos.** Ranking de modelos por unidades, luego ingreso (`line_total`, sin envío), luego código; los modelos con las mismas unidades e ingreso comparten puesto. Detalle por variante. Primeros 20.
7. **Stock bajo.** Por ubicación activa: `disponible = en mano − reservado ≤ umbral`, incluidas las agotadas. Umbral = `settings.low_stock_threshold` (2); un producto con `low_stock_threshold` propio usa el suyo (como la matriz de Stock). **En la demo todos los productos traen umbral propio 2**, así que el valor de `settings` solo rige si se borra el del producto.
8. **Sin rotación.** Variantes con stock (en mano > 0 en alguna ubicación) sin ventas en los últimos `settings.no_rotation_days` (60) días calendario, contando hoy. **No se excluyen las prendas recién ingresadas** (supuesto visible en la pantalla; en la demo todos los ingresos tienen fecha de hoy).
9. **Lista del viernes.** `sugerido = min(disponible en BODEGA, max(0, ventas de TIENDA_RANCAGUA en los últimos N días − disponible en tienda))`, N = `settings.friday_list_days` (14). Disponible descuenta lo reservado. Lo que ya viaja a la tienda se muestra pero **no se resta**. Solo se ve e imprime (A4): no crea el traslado.
10. **Claves de `settings`** (valor de demo, `is_demo_value = true`, sin cambio de esquema): `low_stock_threshold = 2`, `no_rotation_days = 60`, `friday_list_days = 14`. No hay pantalla para editarlas: se cambian en la tabla.
11. **Historial de demo** (`src/modules/demo/history-plan.ts` + `history.ts`). Plan puro y determinista de ~8 semanas (lunes a sábado): ventas POS de las dos vendedoras con los tres medios de pago, algunas anuladas por Belén el mismo día, y pedidos online que se entregan, se cancelan con reembolso pendiente o se cancelan y reembolsan. Todo pasa por `createSale`, `voidSale` y los servicios de `orders`; el stock solo se mueve vía `InventoryService`. Las fechas simuladas se corrigen al final con `update` de Prisma (ventas, pagos, cajas, pedidos); los movimientos de stock y el historial de estados de los pedidos son inmutables por trigger y conservan la fecha del seed. **Caja secuencial por día** (abrir, vender, anular antes de cerrar, cerrar): nunca hay dos abiertas ni se toca el índice `cash_sessions_one_open_per_location_idx`. El stock final queda **exactamente** en el de los casos de prueba de arriba: la carga inicial suma lo que el historial consumirá. Solo corre desde el seed/reinicio con `DEMO_MODE` (`resetAndSeedDemoData({ history: true })`; `runDemoHistory` no se exporta a rutas ni acciones).
12. **Dos comandos de seed.** `pnpm db:seed` carga solo los datos base (como antes: todos los casos de prueba de las etapas 2–6, con sus números `TR-000001`, `PED-000001`, `BOD-000001`, siguen exactos). `pnpm db:seed:history` agrega el historial (unos 12 s en local): los correlativos (`RGA-`, `BOD-`, `PED-`) continúan después del historial, así que los números de los casos manuales cambian. El botón de reinicio de la Etapa 7 debe llamar a `resetAndSeedDemoData({ history: true })`.

### Supuestos a validar con Belén (P-24)

- Umbral de stock bajo en 2 unidades ("2 o menos"), con las agotadas incluidas.
- Sin rotación a los 60 días, sin excluir prendas nuevas.
- Lista del viernes con ventana de 14 días y la fórmula de arriba; lo que ya viaja a la tienda no se resta.
- Semana de lunes a domingo.
- "Tarjeta" = débito + crédito.
- Las ventas se miden por lo cobrado: incluye el redondeo a $10 en efectivo y el envío de los pedidos online.
- Un pedido cancelado sigue sumando en las ventas hasta registrar el reembolso; **un reembolso registrado días después hace desaparecer la venta de su día original** (y ese día baja retroactivamente).
- Una venta anulada no cuenta y desaparece de su día.
- Que Rancagua vende de lunes a sábado (supuesto solo del historial de demo).

## Casos de prueba para la demo (Etapa 6.5)

Usuario: Belén (ADMIN). Cargar los datos con `pnpm db:seed:history` (Docker y `DEMO_MODE=true`). Todos los reportes son de solo lectura.

| # | Caso | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | **Resumen y ventas por medio de pago** (caso principal) | Menú **Reportes** → pestaña **Ventas** (últimos 30 días, por día) | Tarjetas de hoy, semana y mes; total cobrado, ventas y ticket promedio; efectivo, tarjeta y transferencia con su barra; una fila por día (los domingos en cero); suma de los medios = total |
| 2 | **Semana, mes y canal** | Agrupar por **Semana**, luego **Mes**; Canal **Solo online** y **Solo tienda** → Aplicar | Semanas de lunes a domingo (la de los bordes puede ser parcial); online + tienda = ambos; online muestra transferencia y tarjeta con envío incluido |
| 3 | **Anuladas no cuentan** | En el POS (vendedora o Belén) vender y anular una venta del día; volver a Reportes | La venta no suma; aparece "Anuladas en este rango: 1 venta" |
| 4 | **Reembolso pendiente** | Pedidos → cancelar un pedido pagado; mirar Reportes | La tarjeta amarilla "Reembolsos pendientes" sube y el total de ventas **no** baja. Registrar el reembolso en el pedido: la tarjeta baja y la venta sale del total y del día en que se hizo |
| 5 | **Venta de las 23:30** | Vender a las 23:30 (hora de Chile) y mirar el día | Cae en su día de Chile, no en el siguiente |
| 6 | **Más vendidos** | Pestaña **Más vendidos**; tocar un modelo | Ranking por unidades con ingreso; el detalle muestra las variantes. Un rango sin ventas muestra "No hay ventas en este rango" |
| 7 | **Stock bajo** | Pestaña **Stock bajo** | Una sección por ubicación, con las agotadas primero. Reservar unidades de una prenda para un pedido baja su disponible y la hace aparecer |
| 8 | **Sin rotación** | Pestaña **Sin rotación** | Prendas con stock sin ventas en 60 días; las nunca vendidas primero. Bajar `no_rotation_days` en `settings` las aumenta |
| 9 | **Lista del viernes** | Pestaña **Lista del viernes** → Imprimir | Lista A4 "Bodega → Tienda Rancagua" con lo que llevar; jamás más que el disponible de la bodega (no cuenta lo reservado). No crea ningún traslado: Stock y Traslados siguen igual |
| 10 | **Permisos** | La vendedora abre `/reportes` | `/sin-acceso`; el menú no muestra "Reportes" y el servidor rechaza cada consulta |
| 11 | **Celular** | Abrir `/reportes` en vista móvil | Tarjetas apiladas, pestañas con desplazamiento lateral, filtros en dos columnas y tablas con la información secundaria bajo cada fila |

## Pendientes de la Etapa 6 para Fase 1

- **Varias administradoras con PIN:** hoy la elección de quién aprueba es explícita (los fallos cuentan solo para ella), pero la lista de administradoras se muestra a la vendedora en la caja; en producción conviene identificar a la administradora de otra forma (p. ej. escaneando una credencial) y definir quién puede aprobar en cada ubicación.
- **Notificaciones push** (RF-AUT-06): hoy Belén ve las solicitudes por refresco cada ~3 s con la pestaña abierta.
- **Reembolso en la caja:** el reembolso de pedidos online no pasa por la caja de la tienda (el dinero se mueve fuera del POS); el medio de reembolso es texto libre hasta resolver **P-17**.
- **Cambios, devoluciones, cambios fuera de plazo o sin boleta:** siguen fuera de la demo (P-09); los tipos `REEMBOLSO`, `CAMBIO_FUERA_PLAZO` y `CAMBIO_SIN_BOLETA` existen en el esquema pero no tienen flujo.
- **Vencimiento sin job:** las solicitudes vencidas se marcan al consultarlas; con volumen real conviene un job (GitHub Actions → endpoint protegido, ADR-010) que las limpie.
- **Un descuento aprobado cubre todo el carrito** con una sola aprobación (todas las líneas con descuento sobre el límite); si se quiere aprobar por línea, hay que partir la solicitud.


## Decisiones del usuario (Etapa 7)

1. **Guion de demo** en Inicio (`src/components/demo/`), solo con `DEMO_MODE=true`; los casos con `TR-000001` / `PED-000001` de las etapas 4 a 6 solo calzan con `pnpm db:seed` (sin historial). Con historial, los correlativos continúan después de él: se avisa en el guion y en el README.
2. **Reiniciar datos de demo:** `resetDemoData` (`src/modules/demo/reset.ts`) exige ADMIN y `DEMO_MODE` en el servidor y llama a `resetAndSeedDemoData({ history })`. Como el seed regenera los ids de usuario, la acción cierra la sesión y vuelve a `/login`. `DEMO_SEED_HISTORY=false` (opcional) quita el historial del reinicio y de la primera siembra, por si el hosting es lento.
3. **Primera siembra en el hosting:** `pnpm demo:bootstrap` (`seedDemoDataIfEmpty`) siembra solo si no hay usuarios, o si falta el historial de ventas esperado (siembra anterior cortada); en los demás arranques no hace nada.
4. **Render (planes gratuitos):** `render.yaml` en la raíz del repositorio. Las migraciones (`prisma migrate deploy`) y la siembra van en el comando de inicio porque el plan gratuito no tiene pre-deploy. El historial tarda ~18 s en local (el seed base, ~2 s); el tiempo en Render se lee en los logs. Detalle y riesgos en `DEPLOY_RENDER.md`.
5. **`/api/health`:** público, hace `SELECT 1` y responde 200 `{status:"ok"}` o 503. El ping vive en `src/modules/system` (Prisma solo dentro de `src/modules`).
6. **Stock bajo** ya salía ordenado de menor a mayor disponible (y luego por SKU); se agregó un test con muchas variantes que fija el orden. No se limitan filas.
7. **Celular:** el menú pasa a segunda línea en vez de desplazarse; en Stock se ocultan Talla y Total (van bajo el SKU) y en Pedidos se ocultan Unidades, Total y antigüedad (van bajo la clienta).


## Decisiones del usuario (Etapa 8)

1. **Dirección D** (riel lateral oscuro, rosado y vino, Playfair Display para títulos y marca). Las capturas de comparación de las tres direcciones quedan en `docs/diseno/`; las finales llevan el prefijo `final-`.
2. **Confirmaciones:** el `window.confirm` nativo bloquea el navegador (y cualquier automatización) hasta que alguien lo cierra y se ve distinto en celular. Se reemplazó por `ConfirmDialog`, sobre el `AlertDialog` de `@base-ui/react` que ya era dependencia. Reglas: mismo texto, validaciones y permisos; foco inicial en «Cancelar» (un Enter suelto, como el del lector de códigos, cancela y nunca confirma); Escape cancela; mientras corre la acción el botón queda deshabilitado con «Procesando…»; botones de 44 px y texto de 14 px o más. En recibir traslado y preparar pedido el foco vuelve al campo de escaneo. La `idempotencyKey` se sigue generando una vez por pantalla, al montar.
3. **Impresión sin cambios:** el ticket de 80 mm y las guías A4 salen píxel a píxel iguales que antes de pasar los colores a tokens (comparado con el medio `print` emulado y los mismos datos).
4. **Texto de 10 px del ticket:** es intencional (réplica del papel térmico); el resto del sistema usa 12 px o más.

### Pendientes de la Etapa 8

- **Geist Mono:** se mantiene para SKU, números de documento y el ticket; quitarla cambiaría el papel. Confirmar si se prefiere otra solución.
- **Overlay de desarrollo de Next:** en `pnpm dev` aparece un botón «sin foco» que no es de la aplicación; en `pnpm start` no aparece.
- **Playwright:** no está instalado (no hay pruebas e2e en el repositorio); las verificaciones de pantalla de esta etapa se hicieron con Chrome por CDP, sin dependencias nuevas.

