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
- [ ] **Etapa 5 – Pedido online desde BODEGA** (une las antiguas 5a y 5b; un commit por hito)
  - Reglas (ADR-004 v3, RN-07): **se aparta al pagar**. Al registrar el pedido no se reserva nada: solo se muestra el disponible. Al confirmar el pago se reserva en BODEGA, o en la tienda con traslado a bodega si en bodega no hay. Las reservas nacen firmes: **sin vencimientos** ni job de expiración (`expires_at` queda nulo).
  - **Hito 1 – Pedido desde bodega**
    - [ ] Registro (clienta, líneas, despacho) mostrando solo el disponible, sin reservar
    - [ ] Confirmar pago → reserva en BODEGA (si falta stock, se avisa: R-17) + `Sale` canal INSTAGRAM en BODEGA (sin mover stock)
    - [ ] Bodega (Belén con rol ADMIN): "Listo para preparar" → picking escaneando → PREPARADO (`VENTA_ONLINE`) → Despachar → Entregado
    - [ ] Despacho **solo por courier**: Starken, Blue Express y Chilexpress como lista configurable (`settings.couriers`) + N.º de seguimiento
    - [ ] Tablero de pedidos por estado
    - [ ] lint + typecheck + tests · commit
  - **Hito 2 – Apartar en la tienda y traslado automático**
    - [ ] Si bodega no tiene: mostrar la tienda con stock y Belén la elige al confirmar el pago
    - [ ] Confirmar pago → reserva en la tienda + traslado automático tienda → bodega (ESPERANDO_TRASPASO → LISTO_PARA_PREPARAR)
    - [ ] lint + typecheck + tests · commit
  - **Fuera de la demo:** el **retiro en tienda** (EN_CAMINO_A_TIENDA → LISTO_PARA_RETIRO) queda pendiente de P-11 (¿hay retiro y dónde?).
- [ ] **Etapa 6 – Aprobación remota**
  - [ ] Caso principal: **descuento de la vendedora** (límite 0 %, solo Belén da descuentos) → solicitud, caja en espera (polling ~3 s). Además, reembolsos y anulaciones
  - [ ] Vista móvil `/aprobaciones`
  - [ ] Aprobación de uso único (tipo, ubicación y monto) + tests
  - [ ] lint + typecheck + tests · commit
- [ ] **Etapa 7 – Pulido para presentar**
  - [ ] Inicio "Guion de demo" (5 pasos)
  - [ ] Botón reiniciar datos (ADMIN + `DEMO_MODE`)
  - [ ] README en español
  - [ ] Despliegue en Render (`render.yaml` + instrucciones)
  - [ ] lint + typecheck + tests · commit

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
      pedidos/  bodega/
      aprobaciones/            # vista móvil
    modules/
      auth/  locations/  catalog/  inventory/ (⭐)  sales/  approvals/  orders/  customers/
      # cada uno con index.ts como API pública; Prisma solo aquí dentro
    lib/  db.ts  money.ts  dates.ts  errors.ts  access.ts  idempotency.ts
    components/  ui/ (shadcn)  layout/
  tests/  integration/ (Postgres real)
```

`returns/`, `reports/`, `suppliers/`, `billing/` quedan fuera de la demo.

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
- ~~P-08~~ resuelto en v0.4: solo Belén da descuentos; el límite de la vendedora es 0 % (`settings`, sin `is_demo_value`). Falta el flujo de aprobación (Etapa 6): hasta entonces, el POS bloquea todo descuento de la vendedora.
- Cancelación de pedidos online (con liberación de la reserva). Vencimiento de reservas: **no aplica** (ADR-004 v3).
- Extraer el registro de auditoría (`audit_log`) a un módulo propio cuando haya más acciones sensibles (hoy lo escribe `inventory.adjust`).
- Validar el acceso (rol/ubicación) antes de la validación de datos de entrada (hoy InventoryService valida primero con Zod, así que un dato inválido responde `VALIDATION` antes que `FORBIDDEN`).
- Definir el manejo de prendas no incluidas en un traslado (P-23, pendiente con el cliente). En la demo se rechazan al recibir: "Esta prenda no viene en el traslado. Sepárala y avisa a Belén".
- **Idempotencia de `resolveTransferDifference` con restricción única en BD.** Hoy la clave de la operación se guarda en `audit_log.after` (consulta por JSON, sin índice único) porque una MERMA no deja movimiento de stock; la garantía real contra la doble resolución es el cambio condicional de la línea (`difference_resolution IS NULL`) y del traslado (`status = RECIBIDO_CON_DIFERENCIAS`). Para Fase 1: tabla o columna con `UNIQUE (idempotency_key)`.
- **Evaluar con Belén (P-28):** la recepción **a ciegas** (hoy la vendedora ve la cantidad enviada al recibir) y una resolución "error de recepción" para sobrantes (se escaneó de más en destino); hoy un sobrante solo admite `ERROR_ENVIO` (RN-30).
- El traslado de `REENVIO` queda ligado al original solo por texto (`resolution_notes` del borrador y `audit_log`); no hay columna `parent_transfer_id`.
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
