# 07 – Decisiones (ADR) y preguntas abiertas

## 1. Registro de decisiones

Estados: **Aceptada**, **Propuesta**, **Reemplazada**.

### ADR-001 · Monolito modular con Next.js + TypeScript — *Aceptada*
Una sola app con módulos internos (`src/modules/*`) y límites claros. Simple de desplegar para un solo desarrollador.

### ADR-002 · PostgreSQL + Prisma — *Aceptada*
Transacciones y constraints fuertes para el stock. SQL crudo solo dentro de `inventory` para los updates condicionales. Proveedor: Render (ADR-010).

### ADR-003 · Inventario como ledger + saldo materializado — *Aceptada*
`inventory_movements` inmutable + `stock_levels` en la misma transacción; job de conciliación.

### ADR-004 v2 · Canal online desde BODEGA con reservas (+ traspasos desde tiendas) — *Aceptada (2026-09-29, reemplaza a v1)*
- Contexto: ahora hay 2 tiendas y una bodega. La v1 (stock compartido de una tienda con reservas) queda obsoleta.
- Decisión: los pedidos online se reservan y despachan **solo desde BODEGA**. Si falta stock en bodega, Belén elige una tienda donde reservar; al confirmarse el pago se genera un traspaso tienda → bodega ligado al pedido. La reserva "viaja" con el traspaso (se consume en la tienda al enviar y se recrea en bodega al recibir).
- Consecuencias: separación física real de online y tiendas (resuelve el problema original). Aparece una dependencia de traspasos para algunos pedidos.

### ADR-005 · POS web online-only — *Aceptada*
PWA que requiere conexión, con contingencia por ubicación.

### ADR-006 · CLP enteros, IVA incluido, redondeo de efectivo — *Aceptada*
Precios y promociones **iguales en todas las tiendas**.

### ADR-007 · SII fuera del MVP (registro manual de folio/voucher) — *Propuesta, en riesgo*
Depende de P-04. Con dos tiendas, cada una es una sucursal ante el SII. Si hoy no se emite boleta en efectivo/transferencia, adelantar F8.

### ADR-008 · Pedidos de Instagram registrados manualmente por Belén — *Aceptada*

### ADR-009 · Stock online se descuenta al preparar en bodega — *Aceptada*

### ADR-010 · Hosting de bajo costo: Render (app + Postgres) — *Aceptada*
~13 USD al mes. Sin cambios por las nuevas ubicaciones (es la misma app). Vigilar la memoria del plan Starter.

### ADR-011 · Promociones configurables simples — *Aceptada*
% o monto con vigencia, iguales en todas las tiendas. NxM después del MVP.

### ADR-012 · Traspasos con tránsito y recepción confirmada — *Aceptada (2026-09-29)*
- Decisión: el stock baja en origen al **enviar** y sube en destino al **recibir escaneando**. Lo que no llega queda como diferencia en el traspaso hasta que Belén la resuelve (merma, reenvío o error de envío). El "en tránsito" se calcula a partir de los traspasos abiertos.
- Consecuencias: detecta pérdidas entre locales. Requiere disciplina de escanear al recibir, por lo que hay alertas de tránsito.

### ADR-013 · Acceso por rol y ubicación — *Aceptada (2026-09-29)*
- Roles: ADMIN (Belén, todas las ubicaciones), VENDEDORA (una tienda fija), BODEGA (bodega).
- Toda escritura valida rol + ubicación en el servidor. Consultar el stock de otras ubicaciones es de solo lectura para todos.
- Dispositivos POS registrados por tienda.

### ADR-014 · Aprobaciones remotas de Belén — *Aceptada (2026-09-29)*
- Contexto: Belén no puede estar en las dos tiendas a la vez.
- Decisión: solicitudes de autorización (reembolso, anulación, descuento sobre el límite, cambio fuera de plazo) que Belén aprueba desde el celular. La aprobación es de **uso único** y queda ligada a la acción, la ubicación y el monto. En persona se puede usar su PIN. En el MVP la actualización es por consulta periódica (~3 s); las notificaciones push son deseables.
- Consecuencias: Belén pasa a ser un cuello de botella (R-14), mitigado con límites configurables.

### ADR-015 · Retiro en tienda como envío interno del pedido — *Aceptada*
- Decisión: el pedido se prepara y descuenta en bodega y el paquete viaja a la tienda como parte del pedido (estados `EN_CAMINO_A_TIENDA` → `LISTO_PARA_RETIRO`), **no** como traspaso de inventario.
- Consecuencias: la prenda vendida nunca aparece como stock vendible en la tienda de retiro.

### ADR-016 · Salida a producción en dos etapas — *Propuesta*
- Etapa 1 (~enero 2027): inventario de las 3 ubicaciones, traspasos, POS en ambas tiendas, aprobaciones, cambios, y "venta online rápida" desde bodega.
- Etapa 2 (~febrero 2027): pedidos online completos (reservas, traspasos ligados, retiro en tienda).
- Motivo: Providencia ya opera sin sistema; así se obtiene valor antes y se reduce el riesgo.

## 2. Preguntas abiertas

| ID | Pregunta | Afecta | Bloquea |
|----|----------|--------|:------:|
| P-04 | **Contador:** ¿se emite boleta en efectivo y transferencia? ¿Con qué herramienta? ¿Ambas tiendas están registradas como sucursales ante el SII? ¿Facturas a empresas? | ADR-007, F8 | F3 |
| P-05 | Plazo para pagar un pedido online antes de liberar la reserva (por defecto 24 h) | RN-07 | No (configurable) |
| P-06 | ¿Ventas diarias por tienda? (el 20–100 era de una sola tienda) | Rendimiento | No |
| P-08 | Descuento máximo de una vendedora sin aprobación (por defecto 0 %). **Ojo: con 0 % cada descuento le llega a Belén al celular** | RN-09, R-14 | F3 |
| P-11 | Couriers, monto de envío gratis, costo de envío (fijo, por comuna o según courier) | RF-PED-06 | F5 |
| P-16 | Cambio con diferencia a favor de la clienta: ¿vale o dinero? | RF-DEV-02 | F3 |
| P-17 | Reembolso de una compra con tarjeta: ¿anulación en Transbank, transferencia o efectivo? | RF-DEV-03 | F3 |
| P-18 | ¿Promociones se suman o se aplica la mayor? | RN-20 | F3 |
| P-19 | ¿Dónde está la bodega (Rancagua, Santiago)? ¿Cada cuánto viajan traspasos a cada tienda? | Alertas de tránsito, operación | No |
| P-20 | ¿Cómo es el internet en Providencia y en la bodega? | R-04 | F4 |
| P-21 | ¿Las tiendas reciben directo prendas **sin** código de proveedor? (define si necesitan impresora de etiquetas) | Hardware | F0 |
| P-22 | ¿La bodega también recibe devoluciones de pedidos online por courier y las procesa (con aprobación de Belén para el reembolso)? | RF-DEV-07 | F5 |

## 3. Preguntas respondidas

| ID | Respuesta |
|----|-----------|
| P-01 / P-02 | ~~Providencia cierra~~ → **Reemplazado (2026-09-29)**: hay una nueva tienda en Providencia, ya abierta, además de Rancagua y una bodega |
| P-03 | No hay sistema previo; todo manual |
| P-06 (parcial) | 50–300 modelos |
| P-07 | Código del proveedor si existe; si no, interno. SKU `MODELO-COLOR-TALLA` |
| P-09 | Cambios en 30 días; devolución en dinero (con aprobación de Belén); vale de 3 meses; el envío de cambios online lo paga la clienta; prenda dañada → merma |
| P-10 | PC en las 3 ubicaciones; hay que comprar lectores e impresoras. Rancagua con fibra |
| P-12 | ~~Vendedoras o Belén preparan~~ → la **persona de bodega** prepara los pedidos |
| P-13 | Roles: Admin (Belén), Vendedora (tienda fija), **Bodega** |
| P-14 | Presupuesto mínimo → ADR-010 |
| P-15 | Stock por ubicación física |
| 2026-09-29 (reestructuración) | Online **solo desde bodega** · recepción de proveedor **en bodega o tienda** (la vendedora ingresa cantidades; el costo lo completa Belén) · la bodega no vende · traspasos con envío + recepción confirmada · cambios en cualquier tienda · precios y promociones iguales en todas las tiendas · vendedoras fijas por tienda · persona de bodega · si falta en bodega → traspaso desde tienda · retiro en cualquier tienda · vendedoras ven el stock de todo (solo lectura) · aprobación remota de Belén · Instagram lo atiende Belén |

## 4. Historial

| Fecha | Cambio |
|-------|--------|
| 2026-09-29 | v0.1: arquitectura inicial (1 tienda + Instagram) |
| 2026-09-29 | v0.2: respuestas de negocio; hosting Render; promociones |
| 2026-09-29 | **v0.3: reestructuración a 2 tiendas (Rancagua, Providencia) + bodega.** ADR-004 v2, ADR-012 a ADR-016; roles por ubicación; traspasos al MVP; aprobaciones remotas; salida en 2 etapas; nuevas preguntas P-19 a P-22 |
