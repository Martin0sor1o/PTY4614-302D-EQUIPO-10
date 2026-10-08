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
~13 USD al mes.

### ADR-011 · Promociones configurables simples, por canal — *Aceptada*
% o monto con vigencia; canal **solo online o ambos**. NxM después del MVP.

### ADR-012 · Traslados con tránsito y recepción confirmada — *Aceptada*
Hoy los hace Belén en su vehículo, los viernes.

### ADR-013 · Acceso por rol y ubicación — *Aceptada (ajustada 2026-10-02)*
Roles: ADMIN (Belén, todas las ubicaciones, **incluida la operación de la bodega**), VENDEDORA (Tienda Rancagua, caja compartida). El rol BODEGA se mantiene en el modelo para el futuro, sin usuarios.

### ADR-014 · Aprobaciones de Belén (remotas o con PIN) — *Aceptada (confirmada 2026-10-02)*
**Solo Belén** da descuentos, aprueba reembolsos y anula. Límite de descuento de la vendedora = 0 % (configurable). Aprobación remota desde el celular o con su PIN si está en la tienda. Uso único, ligada a tipo, ubicación y monto.

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
| P-23 | Prenda que llega en un traslado sin venir en la lista: ¿qué se hace? | RF-INV-09 | Etapa 4 (demo: se rechaza) |
| P-28 | Validar con Belén cómo se resuelven las diferencias de traslado (RN-30). ¿Hace falta registrar también "error de recepción" (se escaneó de más en destino)? | RN-30 | No (demo con propuesta) |
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
