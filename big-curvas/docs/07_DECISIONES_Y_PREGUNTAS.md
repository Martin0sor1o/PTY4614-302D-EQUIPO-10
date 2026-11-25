# 07 – Decisiones (ADR) y preguntas abiertas

## 1. Registro de decisiones

Estados: **Aceptada**, **Propuesta**, **Reemplazada**.

### ADR-001 · Monolito modular con Next.js + TypeScript — *Aceptada*
Una sola app con módulos internos (`src/modules/*`) y límites claros.

### ADR-002 · PostgreSQL + Prisma — *Aceptada*
Transacciones y constraints fuertes. SQL crudo solo dentro de `inventory` para los updates condicionales. Proveedor: Render (ADR-010).

### ADR-003 · Inventario como ledger + saldo materializado — *Aceptada*
`inventory_movements` inmutable (trigger que solo permite INSERT) + `stock_levels` en la misma transacción.

### ADR-004 v3 · Online desde BODEGA; se aparta al pagar — *Aceptada (2026-10-02, reemplaza a v2)*
- Contexto: la clienta confirmó que lo online sale solo de la bodega y que la prenda **se aparta cuando se paga** (no al acordar el pedido).
- Decisión: al registrar el pedido no se reserva nada (solo se muestra el disponible). Al confirmar el pago se reserva en BODEGA; si no hay, Belén lo aparta en la tienda y se genera un traslado tienda → bodega ligado al pedido (C7). Las reservas nacen firmes: no hay vencimientos ni job de expiración.
- Consecuencias: más simple que v2. Riesgo nuevo: que al pagar ya no haya stock (R-17); el sistema lo valida y avisa.

### ADR-005 · POS web online-only — *Aceptada*

### ADR-006 · CLP enteros, IVA incluido, redondeo de efectivo — *Aceptada*
Precio base igual en todos los canales; las ofertas pueden ser **solo online o de ambos canales**.

### ADR-007 v2 · Boletas con su app actual; el POS registra el N° — *Aceptada (2026-10-02)*
- Contexto: emiten boletas con una app ("Veci"; probablemente **Vessi – Boleta Fácil**, proveedor autorizado por el SII) y cobran con máquinas Transbank y BancoEstado. No emiten facturas.
- Decisión: en el MVP siguen usando su app; el POS guarda tipo y N° de boleta o voucher. Módulo `billing` preparado para integrar la app si ofrece API.
- Consecuencias: el riesgo tributario baja; hay doble digitación hasta la integración.

### ADR-008 · Pedidos de Instagram registrados manualmente por Belén — *Aceptada*

### ADR-009 · Stock online se descuenta al preparar en bodega — *Aceptada*

### ADR-010 · Hosting de bajo costo: Render (app + Postgres) — *Aceptada*
~13 USD al mes. Es el hosting de **producción**. La demo y el staging usan Neon para la base de datos (ADR-019).

### ADR-011 · Promociones configurables simples, por canal — *Aceptada*
% o monto con vigencia; canal **solo online o ambos**. NxM después del MVP.

### ADR-012 · Traslados con tránsito y recepción confirmada — *Aceptada*
Hoy los hace Belén en su vehículo, los viernes.

### ADR-013 · Acceso por rol y ubicación — *Aceptada (ajustada 2026-10-02)*
Roles: ADMIN (Belén, todas las ubicaciones, **incluida la operación de la bodega**), VENDEDORA (Tienda Rancagua, caja compartida). El rol BODEGA se mantiene en el modelo para el futuro, sin usuarios.

### ADR-014 · Aprobaciones de Belén (remotas o con PIN) — *Aceptada (confirmada 2026-10-02)*
**Solo Belén** da descuentos, aprueba reembolsos y anula. Límite de descuento de la vendedora = 0 % (configurable). Aprobación remota desde el celular o con su PIN si está en la tienda. Uso único, ligada a tipo, ubicación y monto.
- Diseño (Etapa 6, 2026-10-21): la aprobación queda **amarrada** al carrito o a la venta con un hash (binding) y un monto recalculados en el servidor; si el carrito o los precios cambian, deja de servir. Se consume con un único UPDATE condicional en la misma transacción que la venta o la anulación.
- PIN presencial: se elige a la administradora y se ingresa su PIN (hash con `scrypt`); bloqueo tras N fallos.
- La anulación de una venta del día en efectivo requiere una caja abierta; el dinero sale de esa caja. Las ventas online no se anulan: se registra el reembolso del pedido cancelado.

### ADR-015 · Retiro en tienda como envío interno del pedido — *En revisión*
Sigue siendo el diseño si existe retiro, pero la existencia del retiro y su lugar quedan pendientes (P-11).

### ADR-016 · Salida a producción en dos etapas — *Aceptada*
Etapa 1 (~enero 2027): tienda + bodega, traslados, POS, aprobaciones. Etapa 2 (~febrero 2027): pedidos online completos.

### ADR-017 · Una tienda + bodega — *Aceptada (2026-10-02, reemplaza la estructura de v0.3)*
- Contexto: la clienta aclaró que **no existe tienda en Providencia**. Solo está la tienda de Rancagua y la bodega (su casa, en preparación).
- Decisión: dos ubicaciones (`TIENDA_RANCAGUA`, `BODEGA`), manteniendo el modelo multi-ubicación por si abre otra tienda.
- Consecuencias: un solo POS, una sola caja; menos esfuerzo.

### ADR-018 · Etiquetado total con código de barras — *Aceptada (2026-10-02)*
- Contexto: solo los jeans traen código del proveedor.
- Decisión: toda prenda se etiqueta con código propio (Code 128 con el SKU) si no trae uno. Impresora de etiquetas obligatoria.
- Consecuencias: venta, conteos y traslados rápidos y sin errores; trabajo inicial de etiquetado antes de la salida (R-01).

### ADR-019 · Neon (Postgres gratis) para la demo y el staging — *Aceptada (2026-11-24)*
- **Contexto:** la base gratuita de Render expira a los 30 días y, si no se pasa a un plan pagado, se borra a los 14 días siguientes. Eso obligaba a recrear la demo cada mes. La base de Render era PostgreSQL 18.
- **Decisión:** la **demo y el staging** usan una base en **Neon**, plan Free: proyecto `big-curvas-demo`, región **AWS US West 2 (Oregon)**, **PostgreSQL 17**. El servicio web sigue en Render (plan gratis, Oregon).
  - **Región Oregon y no São Paulo:** la que consulta la base es la app (Render, Oregon). En la misma región cada consulta tarda ~1 ms (estimado, no medido); en São Paulo serían ~170 ms (estimado, no medido) y el seed (miles de consultas) y cada pantalla se sentirían lentos. La región no se puede cambiar después de crear el proyecto.
  - **Dos cadenas:** la app usa la cadena **pooled** (`DATABASE_URL`) y las migraciones la **directa** (`DIRECT_URL`), porque `prisma migrate deploy` usa un advisory lock que no funciona a través del pooler. Prisma 7 ya no tiene `directUrl` en el esquema: `prisma.config.ts` elige `DIRECT_URL`, y si no existe `DATABASE_URL`.
  - **Pool de `pg`** (`src/lib/db-config.ts`): máximo 5 conexiones, 20 s de espera al conectar (cold start) y 10 s de inactividad.
  - **Secretos:** las cadenas se pegan solo en Render (`sync: false`) y en un `.env.neon` local ignorado por Git. La base ya no se declara en `render.yaml`. Procedimiento de rotación en `docs/DEPLOY_RENDER.md`.
- **Lo que NO cambia:** la **producción real sigue siendo la del ADR-010** (Render Postgres de pago, con respaldo diario externo). Pasar a producción con otro proveedor o plan es una decisión futura de Belén y el equipo; este ADR no la toma.
- **Limitaciones aceptadas** (por ser solo demo): *cold start* (el cómputo se suspende a los 5 min sin consultas, fijo en el plan Free; la primera consulta tarda unos segundos); **1 GB** de almacenamiento por proyecto; **100 CU-horas** de cómputo al mes; **sin SLA**; historial de restauración corto (6 horas). Mitigación: respaldo con `pg_dump`/`pg_restore` probado (`docs/DEPLOY_RENDER.md`, RNF-06).
- **Verificación (2026-11-24):** migraciones y `scripts/verify-db.sql` en Neon (24 tablas, 25 CHECK, 38 índices, 2 triggers de inmutabilidad, todo OK); flujo de la demo en la URL pública (venta POS, aprobación de descuento, traslado con diferencia resuelta, pedido hasta entregado); respaldo de 183 KB restaurado en un Postgres local con los mismos conteos.
- **Pendiente:** consumir una aprobación de descuento en una venta desde **dos dispositivos** (la sesión de la demo es una cookie por navegador; está cubierto por los tests de integración de `approvals`).

### ADR-020 · Autenticación real propia: contraseña para la administradora, dispositivo + PIN para la caja — *Aceptada (2026-11-24)*
- **Contexto:** hasta ahora el acceso era solo el login de la demo ("Entrar como…", sin contraseña, con el id del usuario en una cookie sin firma). RF-USR-01 y RF-USR-02 y la RNF-04 piden contraseña con hash, PIN con hash y permisos por rol y ubicación en el servidor. El repositorio es público, así que no puede llevar ningún secreto ni PIN. El doc 03 preveía Better Auth, pero no se agregan dependencias sin aprobación.
- **Decisión** (implementada con `node:crypto`, sin librerías nuevas, en `src/modules/auth`; `getCurrentUser()` sigue siendo el único punto de identidad y `requireAccess` valida rol + ubicación en toda acción):
  - **Administradora (y bodega): email + contraseña.** Hash `scrypt` con los parámetros dentro del hash (`scrypt$N$r$p$salt$hash`), asíncrono, con `maxmem` explícito y comparación en tiempo constante. Política 🟡 de 12 a 128 caracteres, sin reglas de composición, con lista corta de claves comunes y distinta del email y del nombre. La **vendedora no entra por email**.
  - **Sesiones en la BD** (`sessions`): token de 32 bytes aleatorios en una cookie httpOnly y `SameSite=Lax`; en producción `Secure` y prefijo `__Host-`. En la BD solo está el SHA-256 del token. Vencen por inactividad y de forma absoluta, con la hora de la BD, y se revocan al cerrar sesión, al cambiar la contraseña y al revocar un dispositivo. Web: 12 h de inactividad y 7 días absolutos; caja: **60 min** de inactividad y 12 h absolutas. 🟡
  - **Bloqueo** (`auth_throttles`): 5 fallos y 15 min, por **email escrito** (exista o no la cuenta), con clave y huella de auditoría **HMAC-SHA256 con `AUTH_SECRET`**: no se puede averiguar qué emails existen ni probarlos desde un volcado de la BD. Mensajes genéricos y mismo trabajo de hash con email desconocido.
  - **Primera contraseña:** el usuario inicial lo crea un **script** (`pnpm auth:create-admin`) con contraseña temporal por `AUTH_INITIAL_PASSWORD` (solo en la terminal) o prompt oculto; obliga a cambiarla en el primer ingreso y, hasta entonces, `requireAccess` rechaza todo salvo el cambio. No hay recuperación por email: se reinicia por script (`auth:reset-password`).
  - **Caja (RF-USR-02):** el equipo se vincula a **una tienda** con un código de un solo uso (8 caracteres, 10 min, HMAC en la BD) que genera **solo una administradora**; el servidor entrega un token de dispositivo (cookie, 180 días) y guarda su hash en `pos_devices`. Cada vendedora entra con un **PIN de 6 dígitos** (hash `scrypt` del PIN existente) y solo ve su ubicación; reutiliza `failed_pin_attempts`, `pin_max_attempts` y `pin_lock_minutes`. Revocar un dispositivo corta sus sesiones al instante. Si la sesión de caja vence con una venta a medias, el POS pide el PIN **en la misma pantalla** y el carrito se conserva (además se guarda en `sessionStorage`).
  - **Auditoría** (`audit_log`, regla 9): login, fallo, bloqueo, cierre de sesión, cambio y reinicio de contraseña, alta de usuarios, PIN definido o fallido, vinculación y revocación de dispositivos. Nunca contraseñas, PIN, tokens, códigos, hashes ni emails en claro (un guardia rechaza claves de datos que suenen a secreto).
- **Demo y login real conviven así:** el login demo, el guion, el reinicio de datos y el PIN demo existen **solo con `DEMO_MODE=true`**; sin esa variable no listan, no entran y no se siembran (el bootstrap de arranque no hace nada ni falla). Con `DEMO_MODE=true` la pantalla de login sigue siendo la de siempre y "Ajustes" no aparece. El **PIN demo ya no está en el repositorio**: sale de `DEMO_ADMIN_PIN` (el repositorio y la demo no comparten ningún secreto). El PIN anterior de la demo sigue en el historial de git, que no se reescribe; rotarlo es cambiar la variable en Render y pulsar "Reiniciar datos de demo". **Guardia contra una configuración equivocada:** con `DEMO_MODE=true`, si la base tiene algún usuario con `password_hash` (cuentas reales), el acceso demo queda **deshabilitado** — `demoLogin` y `listDemoLoginOptions` se niegan con "Acceso demo deshabilitado: la base tiene cuentas reales", la cookie demo (que es solo un id de usuario) deja de identificar a nadie, el reinicio de datos y la siembra no tocan nada y se deja una advertencia en el log (chequeo cacheado 3 minutos) —, pero el servicio **sigue arrancando** y el login real funciona (negarse a arrancar causaría un bucle de reinicios que tumbaría la demo). La demo normal no se ve afectada: el seed y "Reiniciar datos de demo" nunca crean un `password_hash` (hay un test).
- **Costo del hash (medido el 2026-11-24):** con N=2^15, r=8, p=3 (equivalente OWASP) un hash tardó ~200 ms en un computador local pero **~2,4 s** con la CPU limitada a 0,1 (la instancia gratuita de Render; medido con `openssl` en un contenedor). Con **p=1 tarda ~1,1 s** y usa la misma memoria (32 MiB), así que se eligió **N=2^15, r=8, p=1**. Los parámetros viajan en el hash: al pasar a un plan pago se sube p a 3 y los hashes se actualizan solos en el siguiente login correcto.
- **Cómo se prueba:** tests de integración contra el Postgres de Docker (nunca contra Neon): login correcto e incorrecto, bloqueo, sesión vencida, acceso cruzado entre ubicaciones con sesiones reales, demo deshabilitado sin `DEMO_MODE`, rutas protegidas, acciones y `/api/health`; además, recorrido manual en el build de producción local con cookies `Secure` y `__Host-` sobre `localhost`. El login real **no se prueba en Render** mientras corra la demo (un segundo servicio gratuito compartiría las 750 horas mensuales y podría suspenderla): si hace falta un staging, se decide aparte.
- **Migración (solo agrega):** una migración con 3 tablas, 4 columnas nuevas en `users`, 7 CHECK y 7 índices; normaliza los emails a minúsculas y no toca los triggers de inmutabilidad ni los CHECK existentes. **Rollback:** como solo agrega, el código anterior sigue funcionando con el esquema nuevo (ignora las tablas y columnas que no conoce), así que volver atrás el código no exige revertir la migración.
- **Excepción acotada a la regla 7 (no borrado físico):** `pnpm auth:purge`, **manual y sin cron**, borra sesiones vencidas o revocadas hace más de 30 días y contadores de intentos viejos. Son datos técnicos, no de negocio; los usuarios y los dispositivos no se borran nunca (se desactivan o revocan).
- **Riesgos aceptados:**
  - **Bloqueo por cuenta:** un tercero puede mantener bloqueada a Belén (5 fallos cada 15 min). Es el costo de bloquear por email; se acepta y el reinicio por script lo resuelve.
  - **Costo de CPU del hash:** en la instancia gratuita cada ingreso con contraseña tarda ~1 s y varios a la vez compiten por 0,1 CPU y 32 MiB cada uno. Aceptable para 1 administradora; se sube el costo al pasar a un plan pago.
  - **Crecimiento de `auth_throttles` y `sessions`:** crecen con cada intento y cada ingreso; la purga es manual. Revisar el tamaño de vez en cuando (Neon Free tiene 1 GB).
  - **Sin 2FA, sin recuperación por email, sin límite por IP y sin cambio de PIN por la propia vendedora:** fuera de alcance de esta iteración.
- **Pendiente (bootstrap de datos para producción real):** hoy ubicaciones, `settings` (límites de PIN, descuento, couriers) y catálogo solo los crea el seed de la demo. Para producción hace falta un **bootstrap propio** (ubicaciones `TIENDA_RANCAGUA` y `BODEGA`, `settings` y carga inicial del catálogo, sin usuarios ni datos de ejemplo), que además debe correr antes de `auth:create-admin` y de vincular el primer equipo de caja. Anotado también en el plan de trabajo. Mientras no exista, el bloqueo de PIN usa los valores por omisión del código (5 intentos y 15 min).

### ADR-021 · Cambios, devoluciones y vales — *Aceptada (2026-11-25; supuestos 🟡 pendientes de validar con Belén)*
- **Contexto:** RF-DEV-01 a 07 y RN-10, 11, 15, 16, 17 y 24 seguían en 🟡 (P-09, P-16, P-17, P-22). Hacía falta una devolución o cambio que mueva stock, caja y vales sin romper las reglas críticas (stock solo vía `InventoryService`, movimientos inmutables, dinero en CLP enteros, aprobaciones de un solo uso, permisos por rol y ubicación).
- **Decisión:**
  - **Una devolución es UNA transacción idempotente** (`returns.createReturn`): venta elegible → caja (si hay efectivo o cambio) → `lockStock` → guardia anti sobre-devolución → aprobación → stock (`InventoryService.returnToStock`, y `writeOff` si la prenda llega dañada) → destino (vale, dinero o cambio) → `returns` + `return_lines` + `audit_log`. Si algo falla, todo se revierte, la aprobación incluida.
  - **Stock:** la prenda entra al stock de la ubicación que la recibe (RN-24) con `DEVOLUCION`; una prenda dañada entra y sale como `MERMA` en la misma transacción (stock neto 0, historia completa). `lockStock` vive dentro de `InventoryService`, bloquea en orden determinista (ubicación, variante) y evita el deadlock entre dos cambios cruzados (hay un test que lo reproduce al quitarlo).
  - **No sobre-devolver:** contador materializado `sale_lines.returned_quantity` con `UPDATE … WHERE returned_quantity + :k <= quantity` (regla 5) y CHECK como red final; `returned_quantity = Σ return_lines.quantity` se verifica en los tests.
  - **Vale = saldo materializado + libro inmutable**, igual que `stock_levels` / `inventory_movements`: `vouchers.balance` solo cambia junto con un `voucher_movements` (`EMISION +`, `CANJE −`, `REPOSICION +`; CHECK tipo ⇔ signo) en la misma transacción. `voucher_movements` tiene trigger de solo-INSERT; `vouchers` no se borra ni cambia su código, monto inicial, vencimiento, ubicación ni emisor. Invariante: saldo = monto inicial + movimientos posteriores a la emisión = suma de todos los movimientos (en los tests y en `scripts/verify-db.sql`). El estado (vigente, agotado, vencido, inactivo) se **calcula**.
  - **Canje anti doble gasto:** se bloquea la fila del vale (`FOR UPDATE`), se decide `min(saldo, total)` con el saldo ya bloqueado y el UPDATE lleva `balance >= monto AND active AND expires_at > now()`. Dos ventas simultáneas con el mismo vale no gastan más que su saldo (test).
  - **Cambio = vale temporal:** el valor devuelto se emite como vale y se canjea al instante en la venta nueva; la diferencia a pagar va con un medio de pago y lo que sobra queda en el vale. Un solo mecanismo para vales y cambios.
  - **Aprobaciones (ADR-014):** una sola por operación, del primer tipo que aplica: dinero → `REEMBOLSO`; fuera de plazo → `CAMBIO_FUERA_PLAZO`; vale o saldo a favor sobre el tope → `VALE_SOBRE_TOPE` (valor nuevo del enum). Hash vinculante = venta + ubicación + líneas `{línea, cantidad, condición}` + destino (+ prendas nuevas del cambio); monto = valor devuelto; un solo uso. Belén (ADMIN) opera directo y queda en `audit_log` con `direct: true` (regla 10b).
  - **Código del vale:** credencial **al portador** (no nominativo), así que se protege como tal: 12 caracteres de un alfabeto de 32 sin ambiguos (sin 0, O, 1, I) elegidos con `crypto.randomInt` (uniforme, sin sesgo): 32^12 = 2^60 combinaciones, nada secuencial ni derivado de datos del vale (`VAL-XXXX-XXXX-XXXX`). **La búsqueda por código tiene límite de intentos:** reutiliza `auth_throttles` (el mismo mecanismo que el código de vinculación de un equipo) con clave HMAC por usuario, nunca el id ni el código en claro; cada búsqueda se cuenta **antes** de mirar la tabla, 10 fallos seguidos bloquean 15 minutos y un acierto reinicia el contador. En `audit_log` solo van los últimos 4 caracteres del código. Un código fijo solo existe para el seed de la demo (`DEMO_MODE`).
  - **FK financieras con `ON DELETE RESTRICT`** (`returns.approval_id`, `cash_session_id`, `voucher_id`, `new_sale_id` y `payments.voucher_id`): nada de lo que respalda un reembolso se borra ni se desvincula en silencio. Índice parcial `payments(voucher_id) WHERE voucher_id IS NOT NULL`.
  - **Módulos:** los vales van en `src/modules/vouchers` (módulo hoja) porque el doc 03 dibuja `returns → sales`: `sales` no puede importar `returns`. `sales` canjea y anula (repone el saldo), `returns` emite y canjea. La cuadratura de caja (`sales/cash.ts`) y `assertNoReturns` leen `returns` con consultas de solo-lectura (excepción acotada a la regla de no importar internos de otro módulo: no se importa el módulo, solo se lee la tabla).
- **Supuestos 🟡** (aprobados el 2026-11-25; viven en `src/modules/returns/rules.ts` y los numéricos se sobrescriben en `settings`; cada uno es una pregunta para Belén):

  | Id | Regla ambigua | Valor aplicado 🟡 | Pregunta |
  |----|---------------|-------------------|----------|
  | S-01 | Plazo | 30 días corridos desde la venta (online: desde la entrega); fuera de plazo pide aprobación (`settings.return_window_days`) | P-09 |
  | S-02 | ¿Hace falta la venta? | Sí, registrada y no anulada; pedido online solo despachado o entregado | P-09, Q-01 |
  | S-03 | Estado de la prenda | Vendible vuelve al stock; dañada entra y sale como merma | P-09 |
  | S-04 | Cuánto se devuelve | Lo pagado por la prenda (con el descuento de su línea), prorrateado en pesos enteros; sin envío | P-09 |
  | S-05 | Cambio | Cualquier valor, sin descuentos en lo nuevo; diferencia a pagar con un medio; a favor queda en vale | P-16 |
  | S-06 | Reembolso en dinero | Vendedora con aprobación de Belén; medio sugerido = el original; efectivo redondeado a $10 y desde la caja abierta | P-17, P-09 |
  | S-07 | Venta pagada con vale | Solo se devuelve en vale o cambio | P-09 |
  | S-08 | Vale | 90 días (`settings.store_credit_validity_days`), uso parcial, no nominativo, tope de la vendedora $50.000 (`settings.voucher_seller_cap`), vencido no se reactiva | P-09 |
  | S-09 | Motivos | Talla · Falla · No es lo esperado · Me arrepentí · Otro (con nota) | P-09 |
  | S-10 | Dónde se procesa | Tienda (vendedora o Belén) y bodega solo Belén (sin cambios ni efectivo); el envío de un cambio online no se automatiza | P-22, P-09, Q-01 |
  | S-11 | Anular una venta con devoluciones | No se puede; anular una venta pagada con vale repone su saldo (sin extender el vencimiento) | P-09 |
  | S-12 | Canje del vale | Cubre hasta su saldo; solo en el POS por ahora (pedidos online, después) | P-09 |

- **Cómo se prueba:** integración contra el Postgres de Docker (nunca Neon): caminos felices (vale, dinero con aprobación, cambio con diferencia a pagar y a favor, pedido online en tienda y en bodega), sobre-devolución, plazo y tope, doble envío (idempotencia), acceso cruzado entre ubicaciones, vale vencido/inactivo/sin saldo, aprobación de un solo uso y amarrada al hash, caja cerrada, redondeo de efectivo, inmutabilidad de movimientos y saldos de vale, doble gasto de un vale desde dos ventas, **dos devoluciones simultáneas de la misma línea** y **dos cambios cruzados simultáneos** (sin ese `lockStock` el test falla con `deadlock detected`).
- **Migración (solo agrega):** 4 tablas, 5 enums y 1 valor de enum, 2 columnas, 15 índices, 12 CHECK y 2 triggers; no toca los triggers, los CHECK ni los índices existentes (incluido `cash_sessions_one_open_per_location_idx`). Probada con `prisma migrate deploy` sobre una base limpia y sobre una con los datos de la demo; `verify-db.sql` pasa a 31 tablas, 44 CHECK, 60 índices, 4 triggers y 6 migraciones, más la invariante de saldo de los vales. **Rollback:** como solo agrega, el código anterior sigue funcionando con el esquema nuevo; `VALE_SOBRE_TOPE` no se puede quitar de un enum, pero es inofensivo.
- **Riesgos aceptados:** (1) los supuestos pueden cambiar con la respuesta de Belén: viven en un solo lugar y el cambio es acotado; (2) el vale es una credencial al portador: quien lo vea lo puede gastar; se mitiga con el código largo, el límite de intentos y la posibilidad de desactivarlo; (3) un cambio toca dos conjuntos de variantes y bloquea más filas que una venta (orden canónico + test); (4) reponer un vale vencido (al anular la venta que lo canjeó) no extiende su vigencia: se informará a Belén.
- **Pendiente:** UI del POS (flujo de devolución/cambio, canje en el cobro), vista de vales para Belén, reporte de devoluciones, seed de la demo y canje de vales en pedidos online (RF-DEV-06 completo).

## 2. Preguntas abiertas

| ID | Pregunta | Afecta | Bloquea |
|----|----------|--------|:------:|
| P-04 | Confirmar el nombre de la app de boletas ("Veci" ¿= Vessi?) y si tiene integración o API. Contacto del contador | ADR-007, post-MVP | No |
| P-06 | Volumen: ventas diarias en tienda y pedidos online diarios (aprox.) | Dimensionamiento | No |
| P-08b | Tipos de promociones que hacen (%, liquidaciones, 2x1) | RF-POS-13/14 | F2 |
| P-09 | Cambios y devoluciones: plazo, ¿dinero o vale?, vigencia del vale, envío de cambios online (hoy: supuestos en 🟡) | RN-10, 15, 16, 17 | F3 |
| P-11 | Envíos: couriers (Starken, Blue Express o Chilexpress), cómo se cobra, envío gratis, ¿hay retiro y dónde? | RF-PED-06/07/08 | Etapa 5 |
| P-16 | Cambio con diferencia a favor de la clienta: ¿vale o dinero? | RF-DEV-02 | F3 |
| P-17 | Reembolso de compra con tarjeta: ¿anulación en la máquina, transferencia o efectivo? | RF-DEV-03 | F3 |
| P-18 | ¿Promociones se suman o se aplica la mayor? | RN-20 | F2 |
| P-19 | ¿Dónde está la bodega (comuna)? | Operación | No |
| P-20 | Equipos e internet en la bodega | R-04, hardware | F4 |
| P-21 | Catálogo: cantidad de modelos y sistema de tallas | Seed, importación | F2 |
| P-22 | ¿Quién registra las devoluciones de pedidos online que llegan por courier a la bodega? | RF-DEV-07 | F3 |
| Q-01 | **¿Se puede devolver o cambiar un pedido online ya entregado, y cómo?** (¿en la tienda o por courier a la bodega? ¿quién paga el envío de vuelta? ¿el plazo corre desde la entrega?). Sin supuesto nuevo: rigen S-01, S-02 y S-10 tal como se aprobaron (ADR-021) | RF-DEV-07, RN-17 | F3 |
| P-23 | Prenda que llega en un traslado sin venir en la lista: ¿qué se hace? | RF-INV-09 | Etapa 4 (demo: se rechaza) |
| P-28 | Validar con Belén cómo se resuelven las diferencias de traslado (RN-30). ¿Hace falta registrar también "error de recepción" (se escaneó de más en destino)? | RN-30 | No (demo con propuesta) |
| P-29 | Contador: tratamiento tributario (IVA/boleta) del costo de envío cobrado en los pedidos online | Boletas, `sales.shipping_cost` | No |
| P-24 | ¿Qué reportes quiere ver Belén a diario o semanalmente? | Dashboards | Post-MVP |
| P-25 | ¿Cuántas vendedoras hay? ¿Turnos? | Usuarios | No |
| P-26 | Fecha deseada de puesta en marcha y meses de mayor venta | Plan | F4 |
| P-27 | ¿Le interesa guardar datos de clientas? ¿Proyecta tienda web? Presupuesto mensual | Alcance futuro | No |

## 3. Preguntas respondidas

| ID | Respuesta (fuente) |
|----|--------------------|
| Ubicaciones | **1 tienda (Rancagua) + bodega (casa de Belén, en preparación).** No hay tienda en Providencia (reunión 2026-10-02) |
| Bodega | De la bodega salen **solo** los pedidos online. Belén la opera y traslada mercadería entre bodega y tienda en su vehículo los viernes |
| Proveedores | Llegan a la tienda o a la bodega, generalmente los viernes |
| Online sin stock en bodega | Se aparta en la tienda y se lleva a bodega (C7) |
| Momento de apartar | **Al pagar** (I1) |
| Descuentos | **Solo Belén** (I2) |
| Aprobaciones | Solo Belén, remoto o con PIN (I3) |
| Caja | Compartida (I7) |
| Boletas | App de boletas + Transbank + BancoEstado; registrados en el SII; sin facturas (C1) |
| Registro actual | Excel manual, separado por medio de pago (C2) |
| Medios de pago | Efectivo, tarjeta y transferencia (C8) |
| Códigos de barra | Solo los jeans; se etiquetará todo (C4) |
| Ofertas | Solo online o en ambos canales (V6) |
| Transición online | Cuando parta el sistema, lo online saldrá de la bodega (V7) |
| Anteriores | IVA incluido · redondeo de efectivo · Transbank · stock baja al preparar · venta online cuenta al pagar · anulación solo Belén y el mismo día · presupuesto mínimo (Render) · stock por ubicación física |

## 4. Historial

| Fecha | Cambio |
|-------|--------|
| 2026-09-29 | v0.1: arquitectura inicial |
| 2026-09-29 | v0.2: respuestas de negocio; hosting Render; promociones |
| 2026-09-29 | v0.3: 2 tiendas + bodega (información de segunda mano) |
| 2026-10-02 | **v0.4: validación con la clienta.** 1 tienda + bodega (ADR-017), se aparta al pagar (ADR-004 v3), solo Belén da descuentos, etiquetado total (ADR-018), boletas con su app (ADR-007 v2). Cambios y devoluciones vuelven a 🟡 hasta validarlos |
| 2026-11-24 | **ADR-019:** la demo y el staging pasan a Neon (Postgres 17, Oregon) por el vencimiento de la base gratuita de Render. La producción sigue en ADR-010 |
| 2026-11-24 | **ADR-020:** autenticación real propia (contraseña `scrypt` para la administradora, dispositivo POS + PIN de 6 dígitos para la caja, sesiones en la BD). El PIN demo sale del repositorio (`DEMO_ADMIN_PIN`). RF-USR-01 y RF-USR-02 implementados. Pendiente: bootstrap de datos para producción real |
| 2026-11-25 | **ADR-021:** cambios, devoluciones y vales (migración que solo agrega: `returns`, `return_lines`, `vouchers`, `voucher_movements`). Supuestos 🟡 S-01 a S-12 aplicados y listados como preguntas para Belén; pregunta nueva Q-01 |
