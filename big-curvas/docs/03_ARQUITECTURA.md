# 03 – Arquitectura

## 1. Principios

1. **Simple primero**: monolito modular, un repositorio, una base de datos. Nada de microservicios.
2. **El inventario es el corazón**: un solo servicio (`InventoryService`) es dueño del stock; todo lo demás le pide cambios.
3. **Ledger + saldo**: el stock es un saldo materializado que siempre cuadra con la suma de movimientos inmutables.
4. **Consistencia antes que disponibilidad**: preferimos rechazar una venta a vender una prenda que no existe.
5. **Stack "amigable con IA"**: tecnologías muy populares, tipadas y con buena documentación, para que Claude Code genere código correcto.
6. **Servicios gestionados**: nada de administrar servidores.

## 2. Stack recomendado

| Capa | Tecnología | Por qué |
|------|-----------|---------|
| Lenguaje | **TypeScript** (strict) en todo el stack | Un solo lenguaje; tipos que atrapan errores de la IA |
| Framework web | **Next.js** (App Router) + React | Front y back en un proyecto; Server Actions y Route Handlers |
| UI | **Tailwind CSS + shadcn/ui** | Componentes accesibles, la IA los domina |
| Base de datos | **PostgreSQL** gestionado (**Render Postgres**, plan pagado básico) | Transacciones ACID, constraints, backups incluidos en planes pagados |
| ORM / migraciones | **Prisma** | Esquema declarativo legible, migraciones versionadas, muy conocido por la IA |
| Validación | **Zod** | Mismo esquema para formularios y servidor |
| Autenticación | **Better Auth** (alternativa: Auth.js) con credenciales + PIN | Control total de roles; sin costo por usuario |
| Tablas / formularios | TanStack Table, React Hook Form | Listados grandes, filtros, formularios complejos |
| Gráficos (post-MVP) | Recharts | Dashboards |
| Códigos de barra | `bwip-js` (generación), lector USB HID (lectura = teclado) | Sin drivers |
| Impresión | CSS de impresión (ticket 80 mm, etiquetas) vía diálogo del navegador | Sin software extra en MVP |
| Excel | `exceljs` / `papaparse` | Import/export |
| Tests | **Vitest** (unit/integración con Postgres real vía Docker) + **Playwright** (E2E) | Críticos para inventario |
| Hosting app | **Render** – Web Service plan Starter (Next.js con `next start`) | Uso comercial permitido, costo fijo y bajo, deploy automático desde GitHub |
| Jobs programados | GitHub Actions `schedule` → endpoint protegido (+ vencimiento "perezoso" al leer reservas) | Sin costo extra |
| Respaldo externo | GitHub Action diaria: `pg_dump` → almacenamiento gratuito (ej. Cloudflare R2, capa gratuita) | Copia fuera del proveedor |
| Fotos (deseable) | Cloudflare R2 (capa gratuita) | Bajo costo |
| Monitoreo | Sentry (plan gratuito) | Errores en producción |
| Repositorio / CI | GitHub + GitHub Actions | Lint, typecheck, tests en cada PR |

### 2.1 Costo estimado (ADR-010)

| Servicio | Plan | USD/mes aprox. |
|----------|------|:-------------:|
| Render Web Service | Starter | 7 |
| Render Postgres | Básico pagado | 6 |
| GitHub, Sentry, R2 | Gratuitos | 0 |
| **Total** | | **~13 USD ≈ $12.000–13.000 CLP** |

- **Vercel queda descartado para producción**: su plan gratuito (Hobby) es solo para uso personal y no comercial, y el plan Pro cuesta 20 USD por usuario al mes.
- Supabase gratuito no se recomienda para producción: no incluye backups descargables y el plan pagado supera el presupuesto.
- Render no tiene región en Sudamérica. La latencia desde Chile a EE.UU. (~150 ms) es aceptable para este POS.
- Alternativa más barata: Railway (Hobby, 5 USD incluidos en uso), con un costo menos predecible.
- Un proveedor de boletas electrónicas (P-04) tendría un costo adicional.
- Precios verificados en septiembre de 2026. Revisarlos antes de contratar.
- Con 3 ubicaciones el tráfico sigue siendo bajo. Hay que vigilar la memoria del plan Starter (512 MB) y, si no alcanza, evaluar un plan mayor (supera el presupuesto; se conversa con Belén).

## 3. Vista general

```mermaid
flowchart LR
    subgraph RGA[Tienda Rancagua]
        POS1[Caja<br/>PC + lector + impresora 80mm]
    end
    subgraph PRO[Tienda Providencia]
        POS2[Caja<br/>PC + lector + impresora 80mm]
    end
    subgraph BOD[Bodega]
        PCB[PC bodega<br/>lector + impresora etiquetas]
    end
    BEL[Belén<br/>PC + celular<br/>Instagram, aprobaciones]

    subgraph Render
        APP[Next.js<br/>UI + Server Actions + API]
        DB[(PostgreSQL)]
    end
    subgraph GitHub
        CRON[Actions: cron + backup]
    end
    ST[(Cloudflare R2<br/>fotos + backups)]
    SII[Proveedor DTE / SII<br/>futuro]
    WEB[Tienda web<br/>futuro]

    POS1 --> APP
    POS2 --> APP
    PCB --> APP
    BEL --> APP
    APP --> DB
    APP --> ST
    CRON --> APP
    CRON --> ST
    APP -. post-MVP .-> SII
    WEB -. post-MVP: reservas en bodega .-> APP
```

Flujo físico de mercadería:

```mermaid
flowchart LR
    PROV[Proveedores] --> BODEGA
    PROV --> RGA[Tienda Rancagua]
    PROV --> PRO[Tienda Providencia]
    BODEGA <-->|traspasos| RGA
    BODEGA <-->|traspasos| PRO
    RGA <-->|traspasos| PRO
    BODEGA -->|pedidos online| COUR[Courier → clienta]
    BODEGA -->|pedido para retiro| RGA
    BODEGA -->|pedido para retiro| PRO
```

## 4. Módulos (monolito modular)

```
src/
  app/                    # Rutas Next.js (solo UI y adaptadores)
    (admin)/...           # Backoffice (Belén)
    pos/...               # POS (por tienda)
    bodega/...            # Recepción, traspasos, picking, despacho
    pedidos/...           # Pedidos online
    aprobaciones/...      # Vista móvil de Belén
    api/                  # Route handlers (cron, futuras integraciones)
  modules/
    auth/                 # Usuarios, roles, PIN, ubicación asignada, permisos
    locations/            # Ubicaciones y su configuración
    catalog/              # Productos, variantes, tallas, colores, SKU, etiquetas
    inventory/            # ⭐ InventoryService: stock, movimientos, reservas, recepciones, conteos, TRASPASOS
    sales/                # Ventas POS, pagos, caja por tienda, anulaciones, pricing/promociones
    approvals/            # Solicitudes de autorización remota
    returns/              # Cambios, devoluciones, vales
    orders/               # Pedidos online (origen bodega, traspasos ligados, retiro en tienda)
    customers/            # Clientes
    suppliers/            # Proveedores
    reports/              # Consultas de lectura / vistas SQL
    billing/              # (futuro) SII / DTE
  lib/                    # db, money (CLP), dates (America/Santiago), errors, access (rol + ubicación)
  components/             # UI compartida (shadcn)
prisma/                   # schema.prisma, migraciones, seed
tests/                    # integración y E2E
docs/                     # estos documentos
```

Reglas de dependencia:

- `app/` solo llama a la API pública de `modules/*` (nunca a Prisma directamente).
- Cada módulo expone un `index.ts`. No se importan archivos internos de otro módulo.
- **Solo `inventory` escribe** en `stock_levels`, `inventory_movements`, `reservations` y `transfers`.
- `sales`, `returns` y `orders` llaman a `InventoryService` dentro de **la misma transacción**.
- `approvals` no ejecuta la acción: cuando Belén aprueba, el módulo solicitante (`sales`/`returns`) la ejecuta con el `approvalId` como credencial de un solo uso.

```mermaid
flowchart TD
    sales --> inventory
    sales --> approvals
    returns --> inventory
    returns --> sales
    returns --> approvals
    orders --> inventory
    orders --> sales
    inventory --> catalog
    inventory --> locations
    sales --> customers
    orders --> customers
    reports -. solo lectura .-> DB[(BD)]
```

## 5. InventoryService (contrato)

Todas las operaciones reciben un `tx`, el `userId`, la **ubicación** y una referencia al documento de origen. Además, validan que el usuario tenga acceso a esa ubicación.

| Operación | Efecto en `físico` | Efecto en `reservado` | Movimiento |
|-----------|:------------------:|:---------------------:|------------|
| `receive(variant, loc, qty, ref)` | +qty | — | `RECEPCION` |
| `adjust(variant, loc, delta, reason)` | ±delta | — | `AJUSTE` |
| `sell(variant, loc, qty, saleId)` | −qty (valida disponible) | — | `VENTA_POS` |
| `returnToStock(variant, loc, qty, returnId)` | +qty | — | `DEVOLUCION` |
| `writeOff(variant, loc, qty, reason)` | −qty | — | `MERMA` |
| `reserve(variant, loc, qty, orderLineId, expiresAt?)` | — | +qty (valida disponible) | (registro en `reservations`) |
| `releaseReservation(reservationId, reason)` | — | −qty | (estado reserva) |
| `consumeReservation(reservationId)` (solo en BODEGA) | −qty | −qty | `VENTA_ONLINE` |
| `sendTransfer(transferId)` | −qty en origen (valida disponible; si la línea lleva `reservationId`, consume esa reserva) | −qty si hay reserva | `TRASPASO_SALIDA` |
| `receiveTransfer(transferId, scannedLines)` | +qty recibida en destino; si la línea está ligada a un pedido, **crea reserva firme** en destino | +qty si hay pedido | `TRASPASO_ENTRADA` |
| `resolveTransferDifference(transferId, resolution)` | según resolución (merma en origen / reingreso / reenvío) | — | `MERMA_TRASPASO` / `AJUSTE` |
| `applyCount(countId)` | ±diferencias en esa ubicación | — | `AJUSTE_CONTEO` |

**Stock en tránsito** = suma de las líneas de traspasos `EN_TRANSITO`. Se calcula, no se guarda en `stock_levels`, y la ubicación de origen es la responsable hasta la recepción.

### 5.1 Control de concurrencia

Nunca "leer, calcular y guardar". Se usa **update condicional atómico**:

```sql
UPDATE stock_levels
SET on_hand = on_hand - :qty, updated_at = now()
WHERE variant_id = :v AND location_id = :l
  AND on_hand - reserved >= :qty;       -- si afecta 0 filas → STOCK_INSUFICIENTE
```

Constraints en BD: `CHECK (on_hand >= 0)`, `CHECK (reserved >= 0)`, `CHECK (reserved <= on_hand)`.
Multi-línea: una sola transacción, variantes ordenadas por (location_id, variant_id) para evitar deadlocks.

### 5.2 Idempotencia

Ventas, pedidos, traspasos (enviar/recibir), recepciones y aprobaciones llevan `idempotencyKey` único.

## 6. Flujos críticos

### 6.1 Venta en POS (por tienda)

```mermaid
sequenceDiagram
    actor V as Vendedora (Providencia)
    participant UI as POS Providencia
    participant S as SalesService
    participant I as InventoryService
    participant DB as PostgreSQL
    V->>UI: escanea código de barras
    UI->>S: variante + disponible en TIENDA_PROVIDENCIA (+ stock en otras ubicaciones, solo consulta)
    V->>UI: confirma pago
    UI->>S: createSale(location=PROVIDENCIA, lines, payments, idempotencyKey)
    S->>DB: BEGIN
    S->>DB: insert sale, lines, payments
    loop cada línea
        S->>I: sell(variant, TIENDA_PROVIDENCIA, qty, saleId, tx)
        I->>DB: UPDATE condicional + INSERT movimiento
    end
    S->>DB: COMMIT
    S-->>UI: venta OK → ticket
```

### 6.2 Pedido online (origen bodega)

1. **Registro (Belén)**: por cada línea, `reserve()` en BODEGA con vencimiento. Si bodega no tiene disponible, se muestra el stock en tiendas y Belén elige una → `reserve()` en esa tienda (la línea queda marcada `source_location`). → `PENDIENTE_PAGO`.
2. **Pago confirmado** → reservas firmes; se crea `Sale` canal INSTAGRAM (ubicación contable: BODEGA). Por cada tienda de origen se crea un **traspaso tienda → bodega** ligado al pedido. → `ESPERANDO_TRASPASO` o `LISTO_PARA_PREPARAR`.
3. **Tienda envía el traspaso** → `sendTransfer()` consume la reserva de la tienda y baja su físico.
4. **Bodega recibe** → `receiveTransfer()` sube el físico de bodega y crea la reserva firme para la línea del pedido. Cuando todas las líneas están reservadas en bodega → `LISTO_PARA_PREPARAR`.
5. **Picking en bodega** → `consumeReservation()` → `PREPARADO`.
6. **Entrega**:
   - Despacho: → `DESPACHADO` → `ENTREGADO`.
   - Retiro en tienda: el paquete (ya vendido, sin efecto en stock) viaja a la tienda → `EN_CAMINO_A_TIENDA` → la tienda confirma llegada → `LISTO_PARA_RETIRO` → la vendedora entrega → `ENTREGADO`.
7. **Vencimientos**: cada 15 min (GitHub Actions → endpoint) se liberan las reservas vencidas y el pedido pasa a `CANCELADO`. Además, el disponible ignora las reservas vencidas aunque el job se atrase.

> Nota: el retiro en tienda se modela como **envío interno del pedido**, no como traspaso de inventario, porque la prenda ya está vendida y descontada en bodega. Para la operación es lo mismo ("se manda a la tienda"), pero evita que esa prenda aparezca como vendible en la tienda.

### 6.3 Traspaso entre ubicaciones

```mermaid
sequenceDiagram
    actor O as Origen (ej. Bodega)
    actor D as Destino (ej. Rancagua)
    participant I as InventoryService
    O->>I: crear traspaso (escanea prendas) → BORRADOR
    O->>I: enviar → baja stock origen, EN_TRANSITO
    Note over O,D: viaje físico (guía impresa)
    D->>I: recibir escaneando
    alt cuadra
        I-->>D: RECIBIDO, sube stock destino
    else diferencia
        I-->>D: RECIBIDO_CON_DIFERENCIAS (sube solo lo escaneado)
        Note over I: Belén resuelve: merma, reenvío o error de envío
    end
```

### 6.4 Autorización remota

1. La vendedora pide un reembolso → `approvals.request({type: REEMBOLSO, locationId, payload})` → `PENDIENTE`.
2. Belén ve la solicitud en `/aprobaciones` (vista móvil; en el MVP se actualiza cada ~3 s, y las notificaciones push son deseables). Aprueba o rechaza.
3. El POS (que consulta el estado) continúa: `returns.refund(..., approvalId)`. El servicio verifica que la aprobación esté `APROBADA`, que coincida con el tipo, la ubicación y el monto, y que no se haya usado antes. Luego la marca `USADA`.
4. Si pasan X minutos sin respuesta → `VENCIDA`.
5. Alternativa presencial: PIN de Belén en el mismo equipo (queda como aprobación con método `PIN`).

### 6.5 Cambio en otra tienda

Una sola transacción en la tienda que atiende: `returnToStock(loc = tienda actual)` (o `writeOff()`) + `sell(loc = tienda actual)` + diferencia. La validación "no devolver más de lo vendido" se hace contra la venta original, sea de la tienda que sea.

## 7. Dinero e impuestos

- `Int` CLP en BD y TS; `lib/money.ts`. Descuentos % en puntos básicos.
- Precios con IVA incluido, **iguales en todas las tiendas**. Neto e IVA solo al emitir documento.
- Redondeo del efectivo a $10 (Ley 20.956): `rounding_adjustment` en la venta.
- Promociones en `sales/pricing.ts` (función pura), iguales en POS y online.
- Cada tienda tiene su propia caja. Los reembolsos en efectivo salen de la caja de la tienda que atiende.

## 8. Seguridad y acceso por ubicación

- Cada Server Action valida **rol + ubicación**: `requireAccess({ roles: ['VENDEDORA'], locationId })`. Vendedora y Bodega solo operan en su `location_id` asignada; Admin en todas.
- Consultar el stock de otras ubicaciones es una acción de solo lectura, separada.
- Dispositivo POS registrado a una tienda: aunque una vendedora cambie de tienda, el equipo solo opera la tienda donde está.
- Acciones sensibles → aprobación de Belén (remota o con PIN) + `audit_log`.
- Secretos en Render y GitHub Secrets.

## 9. Ambientes y despliegue

| Ambiente | Uso | BD |
|----------|-----|----|
| Local | Desarrollo con Claude Code | Postgres en Docker (seed con las 3 ubicaciones) |
| Staging | Pruebas con Belén, vendedoras y bodega | Render gratuito (con sus límites) |
| Producción | Operación | Render pagado + backups del proveedor + `pg_dump` diario externo |

Pipeline: PR → GitHub Actions (lint, typecheck, tests) → merge a `main` → staging → promoción manual a producción. Migraciones revisadas por una persona.

## 10. Contingencia (sin internet)

POS online-only (ADR-005). Rancagua tiene fibra estable; Providencia y bodega por confirmar (P-20). Plan B por ubicación:
1. Internet compartido desde un celular.
2. Si no hay sistema: planilla de contingencia. Al volver, se registran como "ventas de contingencia" (que descuentan stock) y los traspasos se registran con su fecha real.

## 11. Preparado para el futuro

- **Tienda web**: reservará sobre BODEGA con las mismas operaciones.
- **SII**: módulo `billing` con interfaz `DocumentProvider`; cada tienda es una sucursal.
- **Reposición automática**: stock mínimo por (variante, tienda) → sugerencias de traspaso desde bodega.
- **Venta cruzada entre tiendas** (vender en Rancagua y despachar desde Providencia): se apoya en reservas + traspasos, igual que los pedidos online.
