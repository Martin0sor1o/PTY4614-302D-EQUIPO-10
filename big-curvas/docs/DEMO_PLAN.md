# DEMO_PLAN – Demo funcional de Big Curvas

> Documento de seguimiento. Se marca a medida que se avanza; si la sesión se reinicia, retomar desde la primera casilla sin marcar.
> Rama: `feature/demo` · Todo el código vive en `big-curvas/` · Un commit por etapa (Conventional Commits) · Sin push sin pedirlo.

**Objetivo:** demo presentable a Belén que muestre, con datos de ejemplo, cómo el stock se mueve entre `TIENDA_RANCAGUA`, `TIENDA_PROVIDENCIA` y `BODEGA`. Construida con el stack definitivo y las reglas de `CLAUDE.md`, para ser la base de la Fase 1.

## Checklist de etapas

- [x] **Etapa 0 – Plan** (aprobado por el usuario; respuestas registradas abajo)
- [x] **Etapa 1 – Base del proyecto**
  - [x] Next.js + TS strict + Tailwind + shadcn/ui + Prisma + Zod + Vitest (pnpm)
  - [x] `docker-compose.yml`, `.env.example`, `.gitignore`
  - [x] Esquema Prisma + migración (mostrar SQL y esperar aprobación antes de aplicar)
  - [x] `src/lib/money.ts` y `src/lib/dates.ts` + tests
  - [x] Seed (3 ubicaciones, 4 usuarios, ~20 productos, stock con `CARGA_INICIAL`, ledger cuadra)
  - [x] Login demo "Entrar como…" (`DEMO_MODE`) + `getCurrentUser()` + `requireAccess()`
  - [x] Layout con menú por rol e indicador "Ubicación: X"
  - [x] lint + typecheck + tests · commit
- [ ] **Etapa 2 – InventoryService + matriz de stock**
  - [ ] Migrar el seed para que use InventoryService (quitar escritura directa `// SEED:`)
  - [ ] `src/modules/inventory` (receive, adjust, sell, reserve, releaseReservation, consumeReservation, sendTransfer, receiveTransfer)
  - [ ] Tests de integración contra Postgres real (venta OK, stock insuficiente, reserva bloquea venta, concurrencia última unidad, traspaso con diferencia, ledger cuadra, idempotencia, acceso cruzado)
  - [ ] Pantalla Stock (matriz + búsqueda + auto-refresco)
  - [ ] Pantalla Kardex
  - [ ] lint + typecheck + tests · commit
- [ ] **Etapa 3 – POS por tienda**
  - [ ] Escaneo con foco permanente + búsqueda, carrito, descuento por línea
  - [ ] Pago efectivo (vuelto, redondeo $10) / tarjeta (voucher), ticket
  - [ ] Sin stock: otras ubicaciones (consulta) / unidad reservada: indicar pedido
  - [ ] Apertura y cierre de caja
  - [ ] lint + typecheck + tests · commit
- [ ] **Etapa 4 – Traspasos**
  - [ ] Crear (escaneo/búsqueda) → Enviar → EN_TRANSITO
  - [ ] Bandeja "Por recibir" → recibir escaneando → RECIBIDO / RECIBIDO_CON_DIFERENCIAS
  - [ ] Belén resuelve diferencias
  - [ ] Test de acceso cruzado · lint + typecheck + tests · commit
- [ ] **Etapa 5a – Pedido online desde BODEGA**
  - [ ] Registro (cliente, líneas, despacho) con reserva en BODEGA
  - [ ] Confirmar pago → `Sale` canal INSTAGRAM en BODEGA (sin mover stock)
  - [ ] Bodega: "Listo para preparar" → picking escaneando → PREPARADO (`VENTA_ONLINE`) → Despachar (courier + seguimiento) → Entregado
  - [ ] Tablero de pedidos por estado
  - [ ] lint + typecheck + tests · commit
- [ ] **Etapa 5b – Reserva en tienda, traspaso automático y retiro**
  - [ ] Si bodega no tiene: mostrar tiendas con stock, Belén elige → reserva en la tienda
  - [ ] Confirmar pago → traspaso automático tienda → bodega (ESPERANDO_TRASPASO → LISTO_PARA_PREPARAR)
  - [ ] Retiro en tienda: PREPARADO → EN_CAMINO_A_TIENDA → LISTO_PARA_RETIRO → ENTREGADO (campo simple "quién retira")
  - [ ] lint + typecheck + tests · commit
- [ ] **Etapa 6 – Aprobación remota**
  - [ ] Descuento sobre el límite → solicitud, caja en espera (polling ~3 s)
  - [ ] Vista móvil `/aprobaciones`
  - [ ] Aprobación de uso único (tipo, ubicación, monto) + tests
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
- `settings` (clave/valor tipado; `max_seller_discount_bps`, `approval_timeout_minutes`, `reservation_ttl_hours`), porque el límite de descuento debe ser configurable.
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
- El InventoryService se amplía con operaciones auxiliares que el contrato implica pero no lista: `createTransfer`, `cancelTransfer`, `resolveTransferDifference` (el §5 sí la define), consultas de stock/tránsito.
- Pruebas contra una BD `big_curvas_test` en el mismo contenedor Docker (migrada por el `globalSetup` de Vitest).
- Puerto Postgres local: 5432 (libre hoy).

## Respuestas del usuario a las dudas (Etapa 0 aprobada)

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
- **Alcance:** la Etapa 5 se dividió en 5a/5b por el tamaño de las reservas ligadas a traspasos.

## Pendientes para Fase 1

- En producción, el usuario de BD de la app no debe tener permiso `TRUNCATE` sobre `inventory_movements` (el trigger de solo-INSERT no cubre TRUNCATE; en la demo se permite para reiniciar datos y para los tests).
- Validar con el contador el redondeo de efectivo a $10 (1–5 baja, 6–9 sube).
- P-08 (límite de descuento de la vendedora) sigue pendiente con el cliente; en la demo es 10 % (`settings`, marcado `is_demo_value`).
- Vencimiento de reservas (job) y cancelación de pedidos online.
