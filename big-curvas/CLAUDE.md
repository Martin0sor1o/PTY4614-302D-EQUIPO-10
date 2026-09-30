# CLAUDE.md – Big Curvas

Sistema de inventario, POS y pedidos online para tienda de ropa en Chile.
Ubicaciones: `TIENDA_RANCAGUA`, `TIENDA_PROVIDENCIA` (POS) y `BODEGA` (sin público; origen de los pedidos online). Roles: ADMIN (Belén), VENDEDORA (una tienda fija), BODEGA.
Documentación completa en `/docs` (leer `03_ARQUITECTURA.md` y `04_MODELO_DE_DATOS.md` antes de tocar inventario o ventas).

## Stack
Next.js (App Router) · TypeScript strict · Tailwind + shadcn/ui · Prisma + PostgreSQL · Zod · Vitest · Playwright · pnpm
Hosting: Render (app como servidor Node con `next start` + Postgres). Nada específico de Vercel (no usar Vercel Cron, Edge Config, etc.).

## Comandos
- `pnpm dev` – servidor local · `docker compose up -d` – Postgres local
- `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e`
- `pnpm db:migrate` (solo local) · `pnpm db:seed`

## Reglas de negocio CRÍTICAS (no negociables)
1. **Stock solo vía `InventoryService`** (`src/modules/inventory`). Ningún otro módulo escribe en `stock_levels`, `inventory_movements`, `reservations`, `transfers` ni `transfer_lines`.
2. **Todo cambio de stock genera un `inventory_movement` inmutable** (solo INSERT, nunca UPDATE/DELETE) en la misma transacción que actualiza `stock_levels`.
3. **Stock por variante × ubicación.** Nunca un stock "global" sin ubicación. El canal online reserva y despacha **solo desde BODEGA**. Si trae una prenda de una tienda, lo hace vía reserva en la tienda + traspaso a bodega.
3b. **Traspasos:** el stock baja en origen al ENVIAR y sube en destino al RECIBIR lo escaneado. Las diferencias quedan en el traspaso (no se ajustan solas). "En tránsito" se calcula, no se guarda.
4. **`disponible = on_hand − reserved`.** Solo se vende o reserva disponible. Stock nunca negativo (hay CHECK en BD).
5. **Concurrencia:** usar UPDATE condicional atómico (`... WHERE on_hand - reserved >= qty`), jamás leer-calcular-guardar. Operaciones multi-línea en una transacción, variantes ordenadas por id.
6. **Dinero en CLP enteros** (`Int`). Prohibido `float`/`Decimal` para montos. Descuentos % en puntos básicos. Usar `src/lib/money.ts`. Precios incluyen IVA. Redondeo a $10 solo en pagos en efectivo (`rounding_adjustment`). Precios y promociones se calculan solo en `sales/pricing.ts`.
7. **Sin borrado físico.** Desactivar (`active=false`) o anular con movimiento inverso.
8. **Idempotencia:** ventas, pedidos y operaciones de stock desde la UI llevan `idempotencyKey` único.
9. **Auditoría:** toda operación de stock/dinero guarda `userId`; acciones sensibles van a `audit_log`.
10. **Permisos en el servidor por rol Y ubicación:** cada Server Action usa `requireAccess({ roles, locationId })`. VENDEDORA y BODEGA solo escriben en su `location_id`; consultar stock de otras ubicaciones es solo lectura. Ocultar botones no es seguridad.
10b. **Aprobaciones:** reembolsos, anulaciones y descuentos sobre el límite exigen un `approvalId` APROBADO, de uso único y coincidente en tipo, ubicación y monto.
11. **Fechas:** guardar en UTC; mostrar y agrupar reportes en `America/Santiago` (`src/lib/dates.ts`).
12. Si una regla de negocio es ambigua o no está en `/docs`, **pregunta; no la inventes.**

## Arquitectura
- `src/app/*` solo UI y adaptadores; llama a la API pública de `src/modules/<modulo>/index.ts`.
- No importar archivos internos de otro módulo. Prisma solo se usa dentro de `src/modules/*`.
- `sales`, `returns`, `orders` llaman a `InventoryService` pasando el `tx` de su transacción.
- Validación de entrada con Zod en todo Server Action / Route Handler.

## Tests
- Obligatorios para `inventory` (incluidos traspasos), `sales`, `approvals`, `returns`, `orders`: casos felices, stock insuficiente, reservas, traspasos con diferencia, concurrencia (dos ventas de la última unidad), idempotencia, anulación.
- **Test de acceso cruzado** para cada acción nueva (ej. vendedora de Providencia intentando operar en Rancagua → rechazado).
- Tests de integración contra Postgres real (Docker), no mocks del ORM para lógica de stock.
- No modificar un test existente para que pase sin explicar el motivo.

## Convenciones
- Código y nombres técnicos en inglés; textos de UI en español (Chile).
- Conventional Commits (`feat(inventory): ...`). Ramas `feat/NNN-nombre`.
- Componentes UI de shadcn; formularios con React Hook Form + Zod.

## Prohibido
- Ejecutar comandos contra producción, `prisma migrate reset` fuera de local, leer `.env.production`, `git push --force`.
- Cambiar `prisma/schema.prisma` sin mostrar antes la migración y esperar aprobación.
- Agregar dependencias nuevas sin preguntar.

## Proceso
Plan primero → esperar aprobación → implementar en pasos pequeños → lint + typecheck + tests → resumen (qué cambió, cómo probar, riesgos).
