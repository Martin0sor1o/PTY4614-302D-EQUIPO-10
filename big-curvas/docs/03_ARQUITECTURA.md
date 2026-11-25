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
| Base de datos | **PostgreSQL** gestionado (**Render Postgres**, plan pagado básico) en producción; **Neon** (plan gratis, Postgres 17) en demo y staging (ADR-019) | Transacciones ACID, constraints, backups incluidos en planes pagados |
| ORM / migraciones | **Prisma** | Esquema declarativo legible, migraciones versionadas, muy conocido por la IA |
| Validación | **Zod** | Mismo esquema para formularios y servidor |
| Autenticación | **Propia con `node:crypto`** (ADR-020; reemplaza la idea inicial de Better Auth, para no sumar dependencias): contraseña `scrypt` para la administradora, dispositivo POS + PIN de 6 dígitos para la caja, sesiones en la BD | Control total de roles y ubicaciones; sin costo por usuario ni dependencias nuevas |
| Tablas / formularios | TanStack Table, React Hook Form | Listados grandes, filtros, formularios complejos |
| Gráficos (post-MVP) | Recharts | Dashboards |
| Códigos de barra | `bwip-js` (generación), lector USB HID (lectura = teclado) | Sin drivers |
| Impresión | CSS de impresión (ticket 80 mm, etiquetas) vía diálogo del navegador | Sin software extra en MVP |
| Excel | `exceljs` / `papaparse` | Import/export |
| Tests | **Vitest** (unit/integración con Postgres real vía Docker) + **Playwright** (E2E) | Críticos para inventario |
| Hosting app | **Render** – Web Service plan Starter (Next.js con `next start`) | Uso comercial permitido, costo fijo y bajo, deploy automático desde GitHub |
| Jobs programados | GitHub Actions `schedule` → endpoint protegido (vencimiento de solicitudes de aprobación, alertas de traslados) | Sin costo extra |
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
- **Demo y staging (ADR-019):** servicio web en Render (plan gratis) y base en **Neon** (plan Free, PostgreSQL 17, AWS US West 2 Oregon, junto al servicio). Costo 0, sin vencimiento de la base. Limitaciones: cold start (autosuspend a los 5 min; la primera consulta tarda unos segundos), 1 GB, 100 CU-horas al mes y sin SLA. **No es la base de producción**: esa sigue siendo la de esta tabla (ADR-010) y es una decisión futura de Belén y el equipo. El detalle operativo (cadenas pooled y directa, respaldo, rotación de contraseña) está en `docs/DEPLOY_RENDER.md`.
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
    subgraph BOD[Bodega · casa de Belén]
        PCB[PC/notebook bodega<br/>lector + impresora etiquetas]
    end
    BEL[Belén<br/>celular<br/>Instagram, aprobaciones, bodega]

    subgraph Render
        APP[Next.js<br/>UI + Server Actions + API]
        DB[(PostgreSQL)]
    end
    subgraph GitHub
        CRON[Actions: cron + backup]
    end
    ST[(Cloudflare R2<br/>fotos + backups)]
    SII[App de boletas<br/>Vessi u otra · futuro]
    WEB[Tienda web<br/>futuro]

    POS1 --> APP
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
    PROV[Proveedores<br/>generalmente viernes] --> BODEGA[Bodega]
    PROV --> RGA[Tienda Rancagua]
    BODEGA <-->|traslados de Belén<br/>viernes, en su vehículo| RGA
    BODEGA -->|solo pedidos online| COUR[Courier → clienta]
    RGA -->|ventas presenciales| CLI[Clienta en tienda]
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
    returns/              # Cambios y devoluciones: una transacción idempotente (ADR-021)
    vouchers/             # Vales: saldo materializado + libro inmutable; módulo hoja (ADR-021)
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
    returns --> vouchers
    sales --> vouchers
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
| `returnToStock(variant, loc, qty, returnId)` | +qty en la ubicación que recibe la prenda | — | `DEVOLUCION` |
| `writeOff(variant, loc, qty, returnId, reason)` | −qty (solo lo disponible) | — | `MERMA` (prenda devuelta dañada: entra con `DEVOLUCION` y sale con `MERMA`, stock neto 0) |
| `lockStock(keys)` | — (solo bloquea; crea con 0 las filas que falten) | — | — (orden canónico ubicación → variante; lo usa un cambio, que toca dos conjuntos de variantes) |
| `reserve(variant, loc, qty, orderLineId, expiresAt?)` | — | +qty (valida disponible) | (registro en `reservations`) |
| `releaseReservation(reservationId, reason)` | — | −qty | (estado reserva) |
| `consumeReservation(reservationId)` (solo en BODEGA) | −qty | −qty | `VENTA_ONLINE` |
| `sendTransfer(transferId)` | −qty en origen (valida disponible; si la línea lleva `reservationId`, consume esa reserva) | −qty si hay reserva | `TRASPASO_SALIDA` |
| `receiveTransfer(transferId, scannedLines)` | +qty recibida en destino; si la línea está ligada a un pedido, **crea reserva firme** en destino | +qty si hay pedido | `TRASPASO_ENTRADA` |
| `resolveTransferDifference(transferId, lineId, resolution)` (solo ADMIN) | según RN-30: MERMA = sin cambio; REENVIO / ERROR_ENVIO faltante = +d en origen; ERROR_ENVIO sobrante = −d en origen | — | `AJUSTE` (MERMA no genera movimiento; `MERMA_TRASPASO` queda reservado) |
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
    actor V as Vendedora (Rancagua)
    participant UI as POS Tienda Rancagua
    participant S as SalesService
    participant I as InventoryService
    participant DB as PostgreSQL
    V->>UI: escanea código de barras
    UI->>S: variante + disponible en TIENDA_RANCAGUA (+ stock en bodega, solo consulta)
    V->>UI: confirma pago
    UI->>S: createSale(location=TIENDA_RANCAGUA, lines, payments, idempotencyKey)
    S->>DB: BEGIN
    S->>DB: insert sale, lines, payments
    loop cada línea
        S->>I: sell(variant, TIENDA_RANCAGUA, qty, saleId, tx)
        I->>DB: UPDATE condicional + INSERT movimiento
    end
    S->>DB: COMMIT
    S-->>UI: venta OK → ticket
```

### 6.2 Pedido online (origen bodega, se aparta al pagar)

1. **Registro (Belén)**: crea el pedido con sus líneas. El sistema muestra el disponible en BODEGA y en la tienda, pero **no reserva nada** → `PENDIENTE_PAGO`.
2. **Pago confirmado** (una sola transacción):
   - `reserve()` en BODEGA por cada línea. Si bodega no tiene disponible, Belén elige apartarla en la tienda → `reserve()` en TIENDA_RANCAGUA (línea con `source_location`). Si ya no hay stock en ninguna, la confirmación falla y se informa qué prenda falta.
   - Se crea la `Sale` canal INSTAGRAM (ubicación contable: BODEGA).
   - Por las líneas apartadas en la tienda se crea un **traslado tienda → bodega** ligado al pedido.
   - → `ESPERANDO_TRASPASO` o `LISTO_PARA_PREPARAR`.
3. **La tienda envía el traslado** (o Belén lo retira el viernes) → `sendTransfer()` consume la reserva de la tienda y baja su físico.
4. **La bodega recibe** → `receiveTransfer()` sube el físico de bodega y crea la reserva firme para la línea. Cuando todo está reservado en bodega → `LISTO_PARA_PREPARAR`.
5. **Picking en bodega (Belén)** → `consumeReservation()` → `PREPARADO`.
6. **Entrega**: despacho por courier → `DESPACHADO` → `ENTREGADO`. Retiro: por definir (P-11).
7. **Sin reservas que venzan**: como se aparta recién al pagar, no hay reservas por vencer. Un pedido impago se cancela manualmente.

### 6.3 Traslado entre tienda y bodega

```mermaid
sequenceDiagram
    actor O as Origen (ej. Belén en Bodega)
    actor D as Destino (ej. Tienda Rancagua)
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

1. La vendedora pide un descuento o un reembolso → `approvals.request({type, locationId, payload})` → `PENDIENTE`. Como solo Belén da descuentos, este flujo será frecuente.
2. Belén ve la solicitud en `/aprobaciones` (vista móvil; en el MVP se actualiza cada ~3 s, y las notificaciones push son deseables). Aprueba o rechaza.
3. El POS (que consulta el estado) continúa: `returns.refund(..., approvalId)`. El servicio verifica que la aprobación esté `APROBADA`, que coincida con el tipo, la ubicación y el monto, y que no se haya usado antes. Luego la marca `USADA`.
4. Si pasan X minutos sin respuesta → `VENCIDA`.
5. Alternativa presencial: PIN de Belén en el mismo equipo (queda como aprobación con método `PIN`).

### 6.5 Cambios y devoluciones (ADR-021)

Una devolución o un cambio es **una sola transacción idempotente** (`returns.createReturn`), con este orden de bloqueo: **venta → caja → stock**.

1. `FOR SHARE` sobre la venta original (una anulación la toma `FOR UPDATE`: una de las dos espera y la otra falla limpio) y se vuelve a validar su estado. La venta puede ser de cualquier ubicación; la prenda entra a la ubicación que la recibe (RN-24).
2. Reglas: venta registrada y no anulada, pedido online solo despachado o entregado, plazo (S-01), medio de reembolso (S-06, S-07) y tope del vale (S-08). Lo que falla se rechaza antes de mover nada.
3. Caja: el efectivo (reembolso o cambio) exige una caja abierta de la tienda; sin ella, `CONFLICT`.
4. `lockStock` sobre lo que entra y lo que sale, y guardia anti sobre-devolución con `UPDATE sale_lines SET returned_quantity = returned_quantity + :k WHERE … returned_quantity + :k <= quantity`.
5. Aprobación: una VENDEDORA fuera de regla consume una aprobación de Belén (un solo uso, ligada a venta + prendas + destino + monto: `REEMBOLSO`, `CAMBIO_FUERA_PLAZO` o `VALE_SOBRE_TOPE`); Belén opera directo y queda en `audit_log`.
6. Stock vía InventoryService: `returnToStock` (`DEVOLUCION`) y, si está dañada, `writeOff` (`MERMA`).
7. Destino: **vale** (`issueVoucher`), **dinero** (efectivo desde la caja abierta, redondeado a $10) o **cambio** (vale temporal que se canjea al instante en `sales.createSaleInTx`; lo que sobra queda en el vale y la diferencia a pagar va con un medio de pago).
8. `returns` + `return_lines` + `audit_log`.

Anular la venta nueva de un cambio, o una venta con devoluciones, no se puede: para deshacer un cambio se devuelve la prenda nueva. Detalle, supuestos y riesgos en el ADR-021.

## 7. Dinero e impuestos

- `Int` CLP en BD y TS; `lib/money.ts`. Descuentos % en puntos básicos.
- Precios con IVA incluido. Las ofertas pueden ser **solo online o de ambos canales**. Neto e IVA solo al emitir documento.
- Redondeo del efectivo a $10 (Ley 20.956): `rounding_adjustment` en la venta.
- Promociones en `sales/pricing.ts` (función pura), iguales en POS y online.
- La tienda tiene **una caja compartida** por las vendedoras; cada venta registra la vendedora. Los reembolsos en efectivo salen de esa caja.

## 8. Seguridad y acceso por ubicación

- Cada Server Action valida **rol + ubicación**: `requireAccess({ roles: ['VENDEDORA'], locationId })`. Vendedora y Bodega solo operan en su `location_id` asignada; Admin en todas.
- Consultar el stock de otras ubicaciones es una acción de solo lectura, separada.
- Dispositivo POS registrado a la tienda; las vendedoras se identifican con su PIN en la caja compartida.
- Acciones sensibles → aprobación de Belén (remota o con PIN) + `audit_log`.
- Secretos en el panel de Render y en el de Neon; nunca en el repositorio (ver `docs/CREDENCIALES.md`).

### 8.1 Autenticación (ADR-020)

- **Un solo punto de identidad:** `getCurrentUser()` (`src/modules/auth`). Orden: sesión real (cookie → BD) → solo con `DEMO_MODE=true`, la cookie de la demo → `null`. `requireAccess` (acciones) y `requirePageAccess` (páginas) validan rol + ubicación; con contraseña temporal rechazan todo salvo cambiarla. No hay `proxy.ts`: cada página y cada acción se valida en el servidor, y el layout `(app)` redirige a `/login` sin sesión.
- **Administradora (y bodega): email + contraseña.** Hash `scrypt` (N=2^15, r=8, p=1, parámetros dentro del hash, asíncrono). Bloqueo de 5 fallos / 15 min por **email escrito** (exista o no), con clave HMAC-SHA256 (`AUTH_SECRET`); mensajes genéricos y mismo trabajo de hash con email desconocido. La vendedora **no** entra por email.
- **Sesiones** (`sessions`): token aleatorio en cookie httpOnly, `SameSite=Lax`, `Secure` + prefijo `__Host-` en producción; solo el SHA-256 en la BD. Vencen por inactividad y de forma absoluta con la hora de la BD (web 12 h / 7 días; caja **60 min** / 12 h) y se revocan al cerrar sesión, al cambiar la contraseña y al revocar un dispositivo.
- **Caja:** el equipo se vincula a **una tienda** con un código de un solo uso (10 min) que genera una administradora (`pos_devices`, solo hashes); la vendedora entra con su PIN de 6 dígitos y solo ve su ubicación. Si la sesión vence con una venta a medias, el POS pide el PIN en la misma pantalla y conserva el carrito.
- **Demo:** el login sin contraseña, el guion, el reinicio y el PIN demo (`DEMO_ADMIN_PIN`) existen solo con `DEMO_MODE=true` (`src/lib/demo.ts`); el módulo `auth` los aísla en `demo-login.ts`.
- **Auditoría:** `audit_log` (login, fallo, bloqueo, cierre de sesión, cambios de contraseña y PIN, vinculación y revocación de dispositivos), sin secretos.
- **Operación:** scripts `auth:create-admin`, `auth:reset-password`, `auth:create-user` y `auth:purge` (esta última, manual, borra solo datos técnicos viejos: excepción acotada a la regla 7).

## 9. Ambientes y despliegue

| Ambiente | Uso | BD |
|----------|-----|----|
| Local | Desarrollo con Claude Code | Postgres en Docker (seed con tienda + bodega) |
| Demo / Staging | Pruebas con Belén y vendedoras | Servicio en Render gratis + base en Neon Free (ADR-019): cadena pooled para la app y directa para migraciones (`DIRECT_URL`); con sus límites (cold start, 1 GB, sin SLA) |
| Producción | Operación | Render pagado + backups del proveedor + `pg_dump` diario externo |

Pipeline: rama `feature/*` → PR a `develop` → GitHub Actions (lint, typecheck, tests) → staging → promoción manual a producción. `main` se reserva para las entregas del curso. Migraciones revisadas por una persona.

## 10. Contingencia (sin internet)

POS online-only (ADR-005). Rancagua tiene fibra estable; bodega por confirmar (P-20). Plan B:
1. Internet compartido desde un celular.
2. Si no hay sistema: planilla de contingencia. Al volver, se registran como "ventas de contingencia" (que descuentan stock) y los traslados se registran con su fecha real.

## 11. Preparado para el futuro

- **Tienda web**: reservará sobre BODEGA con las mismas operaciones.
- **Boletas**: módulo `billing` con interfaz `DocumentProvider`, para integrar su app de boletas (Vessi u otra) si ofrece API.
- **Reposición sugerida**: stock mínimo por (variante, ubicación) → sugerencias de traslado.
- **Segunda tienda**: el modelo multi-ubicación ya lo soporta (ubicaciones, traslados, permisos por ubicación).
