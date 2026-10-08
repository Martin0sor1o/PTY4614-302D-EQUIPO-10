# 02 – Requerimientos

Prioridad: **M** = MVP obligatorio · **D** = deseable en MVP · **F** = fase posterior.
Estado de reglas: ✅ confirmada · 🟡 propuesta (validar con Belén) · ❓ depende de pregunta abierta.

---

## 1. Roles, ubicaciones y permisos

Ubicaciones: `TIENDA_RANCAGUA` (con POS, caja compartida) y `BODEGA` (casa de Belén, sin atención de público; origen del canal online). Hoy Belén opera la bodega con su rol Admin; el rol Bodega queda disponible para el futuro.

| Acción | Admin (Belén) | Vendedora (su tienda) | Bodega |
|--------|:-----:|:---------:|:------:|
| Gestionar usuarios, ubicaciones y configuración | ✔ | — | — |
| Productos, variantes, precios, promociones | ✔ | — | — |
| Ver costos y márgenes | ✔ | — | — |
| Consultar stock de **todas** las ubicaciones | ✔ | ✔ (solo lectura) | ✔ (solo lectura) |
| Recepción de proveedor | ✔ (tienda o bodega) | ✔ solo en su tienda, sin costos ✅ | ✔ en bodega, sin costos 🟡 |
| Imprimir etiquetas | ✔ | ✔ | ✔ |
| Crear/enviar traspaso desde su ubicación | ✔ | ✔ | ✔ |
| Confirmar recepción de traspaso en su ubicación | ✔ | ✔ | ✔ |
| Resolver diferencias de traspaso | ✔ | — | — |
| Ajustes de stock | ✔ | — | — |
| Conteo físico | ✔ (aprueba) | ✔ cuenta en su tienda | ✔ cuenta en bodega |
| Vender en POS | ✔ | ✔ solo en su tienda | — |
| Abrir/cerrar caja | ✔ | ✔ solo en su tienda | — |
| Aplicar descuentos | ✔ | Solo con **aprobación de Belén** (límite propio = 0 %) ✅ | — |
| Anulación, reembolso de dinero | ✔ | Solicita → **aprobación de Belén** (remota o PIN) ✅ | — |
| Cambios | ✔ | ✔ (ventas de la tienda u online) 🟡 | ✔ (pedidos online devueltos a bodega) |
| Registrar pedidos online | ✔ ✅ | — | — |
| Preparar y despachar pedidos online | ✔ | — | ✔ |
| Recibir paquete de retiro y entregarlo a la clienta | ✔ | ✔ (su tienda) | — |
| Reportes de ventas | ✔ todas | Solo su tienda, del día / su caja | — |

Regla transversal: un usuario Vendedora o Bodega **solo puede ejecutar operaciones en su ubicación asignada**. Se valida en el servidor.

---

## 2. Requerimientos funcionales

### 2.1 Usuarios y ubicaciones (USR)

| ID | Requerimiento | Prio |
|----|---------------|:----:|
| RF-USR-01 | Login con email + contraseña (Belén) | M |
| RF-USR-02 | Equipo de caja: sesión de "dispositivo POS" **ligada a una tienda** + PIN por vendedora | M |
| RF-USR-03 | Activar/desactivar usuarios (nunca borrar) | M |
| RF-USR-04 | Toda operación de stock o dinero guarda usuario y ubicación | M |
| RF-USR-05 | Cada usuario Vendedora/Bodega tiene **una ubicación asignada** | M |
| RF-USR-06 | Ubicaciones configurables (nombre, tipo, si vende en POS, si despacha online, si recibe proveedores) | M |

### 2.2 Autorizaciones remotas (AUT) — nuevo

| ID | Requerimiento | Prio |
|----|---------------|:----:|
| RF-AUT-01 | La vendedora crea una **solicitud de autorización** (**cualquier descuento**, reembolso, anulación, cambio fuera de plazo o sin boleta) con el detalle y el motivo | M |
| RF-AUT-02 | Belén ve las solicitudes pendientes en su celular (web responsive/PWA) y **aprueba o rechaza** con un comentario | M |
| RF-AUT-03 | La caja queda esperando la respuesta y continúa sola al aprobarse | M |
| RF-AUT-04 | La solicitud vence si no se responde en X minutos (configurable) | M |
| RF-AUT-05 | Si Belén está presente, puede autorizar en el mismo equipo con su PIN | M |
| RF-AUT-06 | Notificación push al celular de Belén | D |
| RF-AUT-07 | Historial de solicitudes (quién, qué, cuándo, resultado) | M |

### 2.3 Catálogo (CAT)

| ID | Requerimiento | Prio |
|----|---------------|:----:|
| RF-CAT-01 | CRUD de productos: nombre, código de modelo, categoría, descripción, precio de venta, costo, estado | M |
| RF-CAT-01b | Fotos de producto | D |
| RF-CAT-02 | Tablas maestras de tallas (con orden) y colores | M |
| RF-CAT-03 | Matriz de variantes talla × color, desactivando combinaciones inexistentes | M |
| RF-CAT-04 | SKU único y código de barras único por variante: el del proveedor si existe (hoy solo jeans), si no uno interno ✅ | M |
| RF-CAT-05 | Precio a nivel producto con override por variante (precio base igual en todos los canales; las ofertas pueden ser por canal) | M |
| RF-CAT-06 | Impresión de etiquetas con código de barras (tienda o bodega). **Se etiqueta toda la ropa** (ADR-018) ✅ | M |
| RF-CAT-07 | Búsqueda por nombre, SKU, código de barras, categoría | M |
| RF-CAT-08 | Importación masiva desde Excel/CSV | M |
| RF-CAT-09 | Categorías | M |
| RF-CAT-10 | Historial de cambios de precio | D |

Formato de SKU ✅: `{MODELO}-{COLOR}-{TALLA}` (ej. `JMT012-NEG-44`). Código de barras interno: Code 128 con el SKU 🟡.

### 2.4 Inventario multi-ubicación (INV)

| ID | Requerimiento | Prio |
|----|---------------|:----:|
| RF-INV-01 | Stock por **variante × ubicación**: físico, reservado, disponible; más **en tránsito** (traspasos enviados y no recibidos) | M |
| RF-INV-02 | Movimientos inmutables (tipo, cantidad, ubicación, usuario, documento de origen, saldo resultante) | M |
| RF-INV-03 | Ajuste manual con motivo obligatorio (solo Belén) | M |
| RF-INV-04 | **Recepción de proveedor en bodega o en tienda** (generalmente los viernes) ✅: cantidades por variante, proveedor opcional, N° documento. La vendedora o la bodega ingresan cantidades; **el costo lo completa Belén** (la recepción queda "pendiente de costo") | M |
| RF-INV-05 | Conteo físico **por ubicación** (total o parcial): se cuenta con lector, se revisan diferencias y Belén aprueba → ajustes | M |
| RF-INV-06 | Carga inicial desde el **Excel actual** (importación) y conteo físico en tienda y bodega | M |
| RF-INV-07 | Kardex por variante (filtrable por ubicación) | M |
| RF-INV-08 | Vista **matriz de stock**: variante × ubicación (Tienda Rancagua / Bodega / En tránsito / Total) | M |
| RF-INV-09 | **Traslados (traspasos)** entre tienda y bodega (hoy los hace Belén en su vehículo, los viernes ✅): crear (escaneando), enviar (queda EN_TRÁNSITO y baja el stock de origen), recibir escaneando en destino (sube el stock de destino); **diferencias** registradas y resueltas por Belén ✅ | M |
| RF-INV-10 | Traspasos ligados a un pedido online (tienda → bodega) creados automáticamente al confirmar el pago | M |
| RF-INV-11 | Alerta de traspasos en tránsito por más de X días (configurable) | M |
| RF-INV-12 | Stock bajo por variante y ubicación | D |
| RF-INV-13 | Stock mínimo por ubicación y sugerencia de reposición | F |
| RF-INV-14 | Guía de traspaso imprimible (lista de prendas) | D |

Estados de un traspaso:

```mermaid
stateDiagram-v2
    [*] --> BORRADOR: crear (origen escanea prendas)
    BORRADOR --> ANULADO: anular
    BORRADOR --> EN_TRANSITO: enviar (baja stock en origen)
    EN_TRANSITO --> RECIBIDO: destino escanea y cuadra
    EN_TRANSITO --> RECIBIDO_CON_DIFERENCIAS: faltan o sobran prendas
    RECIBIDO_CON_DIFERENCIAS --> CERRADO: Belén resuelve (merma / reenvío / error)
    RECIBIDO --> [*]
    CERRADO --> [*]
    ANULADO --> [*]
```

### 2.5 POS por tienda (POS)

| ID | Requerimiento | Prio |
|----|---------------|:----:|
| RF-POS-01 | Abrir caja con monto inicial. **Caja compartida** por las vendedoras de la tienda ✅ | M |
| RF-POS-02 | Agregar productos por código de barras o búsqueda | M |
| RF-POS-03 | Vender solo el **disponible de la tienda**. Si no hay, mostrar si hay en bodega (solo consulta) | M |
| RF-POS-04 | Descuento manual por línea y por venta. **Solo Belén da descuentos** ✅: la vendedora tiene límite 0 % (configurable) y cualquier descuento genera una solicitud de aprobación | M |
| RF-POS-05 | Medios de pago ✅: efectivo, tarjeta débito/crédito (máquinas **Transbank** y **BancoEstado**), transferencia; y vale. Pagos mixtos (D) | M |
| RF-POS-06 | Registrar N° de voucher y N° de boleta emitida en su app de boletas ("Veci", probablemente Vessi) | M |
| RF-POS-07 | Ticket 80 mm con datos de la tienda | M |
| RF-POS-08 | Asociar cliente (opcional) | D |
| RF-POS-09 | Anular venta del mismo día (solicitud → aprobación de Belén) | M |
| RF-POS-10 | Cierre de caja (observación obligatoria si hay diferencia 🟡) | M |
| RF-POS-11 | Ingresos/egresos de efectivo con motivo | D |
| RF-POS-12 | Idempotencia | M |
| RF-POS-13 | Promociones configurables (% o monto; por producto, variante o categoría; con vigencia) **por canal: solo online o ambos** ✅ | M |
| RF-POS-14 | Promociones por cantidad (2x1, 3x2) | F |
| RF-POS-15 | Redondeo del efectivo a $10 (Ley 20.956) | M |
| RF-POS-16 | Numeración de ventas con prefijo por ubicación (ej. `RGA-000123`; online `BOD-000045`) 🟡 | M |

### 2.6 Cambios y devoluciones (DEV)

| ID | Requerimiento | Prio |
|----|---------------|:----:|
| RF-DEV-01 | Buscar la venta original (de la tienda o de un pedido online) | M |
| RF-DEV-02 | **Cambio** en la tienda: lo devuelto entra al stock de la tienda; lo nuevo sale de ahí. Plazo y diferencia a favor según P-09/P-16 🟡 | M |
| RF-DEV-03 | Devolución con **reembolso en dinero**, previa aprobación de Belén (🟡 P-09). Se registra el medio (❓ P-17). El efectivo sale de la caja | M |
| RF-DEV-04 | Estado de la prenda devuelta: vendible (entra al stock de esa ubicación) o dañada (merma) | M |
| RF-DEV-05 | Plazo configurable (30 días 🟡); no devolver más unidades de las vendidas | M |
| RF-DEV-06 | Vales con código, saldo y vencimiento (3 meses 🟡), usables en tienda y online | M |
| RF-DEV-07 | Devolución de pedidos online: en la tienda o por courier a la bodega (la registra Belén ❓ P-22). Quién paga el envío del cambio 🟡 | M |

### 2.7 Pedidos online (PED)

| ID | Requerimiento | Prio |
|----|---------------|:----:|
| RF-PED-01 | **Belén** registra el pedido ✅: canal, cliente, líneas, método de entrega (despacho por courier / retiro ❓ P-11), dirección, costo de envío | M |
| RF-PED-02 | Al registrar, el sistema **muestra** el disponible en BODEGA y en la tienda, pero **no aparta nada** hasta el pago ✅ | M |
| RF-PED-03 | **Al confirmar el pago se aparta (reserva)** ✅: en BODEGA; si bodega no tiene, Belén elige apartarlo en la tienda (su POS ya no puede venderlo). Si al pagar ya no hay stock, el sistema lo avisa y el pedido no se confirma hasta resolverlo | M |
| RF-PED-04 | Al confirmar el pago se generan los **traslados tienda → bodega** de las líneas apartadas en la tienda ✅ (C7) | M |
| RF-PED-05 | Cuando todas las unidades están en bodega → "Listo para preparar". Belén escanea cada prenda y se consume el stock | M |
| RF-PED-06 | **Despacho** por courier (lista configurable: Starken, Blue Express, Chilexpress ❓ P-11) con N° de seguimiento | M |
| RF-PED-07 | Retiro (en tienda o en bodega) ❓ P-11 | D |
| RF-PED-08 | Costo de envío y envío gratis sobre un monto ❓ P-11 (configurable) | M |
| RF-PED-09 | Cancelar: libera las reservas; si hay traslado en curso, al llegar a bodega queda como stock libre; si ya estaba preparado, se reingresa a bodega | M |
| RF-PED-10 | Tablero por estado con antigüedad (ej. "esperando traslado", "listo para preparar") | M |
| RF-PED-11 | Guía/etiqueta de despacho imprimible | D |
| RF-PED-12 | Plantilla de mensaje para la clienta | D |

Estados del pedido:

```mermaid
stateDiagram-v2
    [*] --> PENDIENTE_PAGO: registrar (sin reserva)
    PENDIENTE_PAGO --> CANCELADO: cancelar / no pagó
    PENDIENTE_PAGO --> PAGADO: confirmar pago (aparta stock)
    PAGADO --> ESPERANDO_TRASPASO: hay líneas apartadas en la tienda
    PAGADO --> LISTO_PARA_PREPARAR: todo en bodega
    ESPERANDO_TRASPASO --> LISTO_PARA_PREPARAR: traslado recibido en bodega
    LISTO_PARA_PREPARAR --> PREPARADO: picking en bodega (consume stock)
    PREPARADO --> DESPACHADO: courier
    PREPARADO --> LISTO_PARA_RETIRO: retiro (❓ P-11)
    LISTO_PARA_RETIRO --> ENTREGADO: clienta retira
    DESPACHADO --> ENTREGADO
    PAGADO --> CANCELADO: Belén
    ESPERANDO_TRASPASO --> CANCELADO: Belén
    LISTO_PARA_PREPARAR --> CANCELADO: Belén
    PREPARADO --> CANCELADO: Belén (reingresa a bodega)
    ENTREGADO --> [*]
    CANCELADO --> [*]
```

### 2.8 Clientes (CLI)

| ID | Requerimiento | Prio |
|----|---------------|:----:|
| RF-CLI-01 | Ficha básica: nombre, @instagram, teléfono, email, RUT (opcional), direcciones | M |
| RF-CLI-02 | Historial de compras (tienda y online) y vales | D |

### 2.9 Proveedores (PRV)

| ID | Requerimiento | Prio |
|----|---------------|:----:|
| RF-PRV-01 | Ficha de proveedor | M (simple) |
| RF-PRV-02 | Órdenes de compra y recepción contra OC | F |
| RF-PRV-03 | Sugerencia de compra según ventas y stock total | F |

### 2.10 Reportes (REP)

| ID | Requerimiento | Prio |
|----|---------------|:----:|
| RF-REP-01 | Ventas del día por canal y **por medio de pago** (como su Excel actual), por vendedora | M |
| RF-REP-02 | Cierre de caja | M |
| RF-REP-03 | Stock por ubicación y consolidado, valorizado a costo, exportable | M |
| RF-REP-04 | Traspasos en tránsito y con diferencias | M |
| RF-REP-05 | Stock bajo por ubicación | D |
| RF-REP-06 | Dashboards diario/semanal/mensual por canal (contenido ❓ P-24) | F |
| RF-REP-07 | Análisis de productos: más vendidos, sin rotación, ventas por talla/color, qué llevar a la bodega o a la tienda | F |
| RF-REP-08 | Exportar listados a Excel/CSV | D |

### 2.11 Facturación electrónica (SII) ❓

| ID | Requerimiento | Prio |
|----|---------------|:----:|
| RF-SII-01 | Integración con su app de boletas (Vessi u otra) para emitir la boleta desde el POS | F (❓ P-04) |
| RF-SII-02 | Nota de crédito en devoluciones con reembolso | F (❓ P-04) |
| RF-SII-03 | Factura a empresas | No aplica (no emiten facturas ✅) |

Nota: hoy emiten boletas con una app ("Veci"; probablemente **Vessi – Boleta Fácil**, proveedor autorizado por el SII) y cobran con máquinas Transbank y BancoEstado. El voucher de tarjeta vale como boleta; en efectivo y transferencia se emite boleta con la app. En el MVP el POS registra el N° de boleta/voucher; la integración queda para después.

---

## 3. Reglas de negocio

| ID | Regla | Estado |
|----|-------|:------:|
| RN-01 | Stock por **variante × ubicación física** (Tienda Rancagua, Bodega). No existe stock "sin ubicación" | ✅ |
| RN-02 | Todo cambio de stock ocurre **solo vía InventoryService** y genera un movimiento inmutable | ✅ |
| RN-03 | `disponible = físico − reservado`. Solo se vende/reserva/traslada disponible. Nunca stock negativo | ✅ |
| RN-04 | El canal online **despacha solo desde BODEGA**. Si falta stock en bodega, se aparta en la tienda y se traslada a bodega | ✅ |
| RN-05 | Montos en CLP enteros; precios con IVA incluido. Precio base igual en todos los canales; **ofertas pueden ser solo online o de ambos canales** | ✅ |
| RN-06 | Nada se borra físicamente | ✅ |
| RN-07 | Un pedido online **se aparta al confirmar el pago**; antes no se reserva nada | ✅ |
| RN-08 | El stock de un pedido online se descuenta al prepararlo en bodega | ✅ |
| RN-09 | **Solo Belén da descuentos.** Límite de la vendedora = 0 % (configurable); todo descuento de una vendedora requiere su aprobación | ✅ |
| RN-10 | Plazo de cambio: 30 días con boleta | 🟡 P-09 |
| RN-11 | Prenda devuelta dañada → merma | 🟡 |
| RN-12 | Anular una venta solo el mismo día y con aprobación de Belén | ✅ |
| RN-13 | La venta online se contabiliza al confirmar el pago | ✅ |
| RN-14 | Fechas en UTC; reportes en hora de Chile | ✅ |
| RN-15 | Devolución con reembolso en dinero, solo con aprobación de Belén | 🟡 P-09 |
| RN-16 | Vales vencen a los 3 meses | 🟡 P-09 |
| RN-17 | En cambios de pedidos online, el envío lo paga la clienta | 🟡 P-09 |
| RN-18 | Envío cobrado aparte; envío gratis sobre un monto; opción de retiro | ❓ P-11 |
| RN-19 | Redondeo del efectivo a $10 (Ley 20.956) | ✅ |
| RN-20 | Promociones: no se acumulan; se aplica la más conveniente para la clienta | 🟡 P-18 |
| RN-21 | Código de barras del proveedor si existe; si no, interno. **Toda prenda se etiqueta** | ✅ |
| RN-22 | Vendedoras (y Bodega) **solo operan en su ubicación asignada**; pueden consultar el stock de todas | ✅ |
| RN-23 | Traslado: al **enviar** baja el stock en origen; al **recibir** sube en destino **lo escaneado**. La diferencia queda en el traslado hasta que Belén la resuelve | ✅ |
| RN-24 | Cambios y devoluciones en la tienda (o en bodega para pedidos online); la prenda devuelta entra al stock de la ubicación que la recibe | 🟡 |
| RN-25 | Reembolsos, anulaciones y descuentos requieren **aprobación de Belén**: remota desde su celular o con su PIN si está presente | ✅ |
| RN-26 | La recepción de proveedor la ingresa la vendedora (en tienda) o Belén (en bodega); **el costo lo completa solo Belén** | ✅ |
| RN-27 | Los pedidos online los registra solo Belén | ✅ |
| RN-28 | La bodega no vende al público (sin POS) | ✅ |
| RN-29 | La caja de la tienda es **compartida** por las vendedoras; cada venta registra qué vendedora la hizo (PIN) | ✅ |
| RN-30 | Resolución de diferencias de traslado (solo Belén, por línea; d = enviado − recibido): **Faltante → MERMA** (pérdida en el camino; sin movimiento de stock, queda registrada en el traslado y en `audit_log`) · **Faltante → REENVIO** (la prenda se quedó en el origen: AJUSTE +d en origen y nuevo traslado en borrador) · **Faltante → ERROR_ENVIO** (se anotó de más: AJUSTE +d en origen) · **Sobrante → ERROR_ENVIO** (salió más de lo anotado: AJUSTE −d en origen; si el origen no tiene disponible, Belén ajusta antes) | 🟡 P-28 |

---

## 4. Requerimientos no funcionales

| ID | Requerimiento |
|----|---------------|
| RNF-01 | **Consistencia de stock**: operaciones concurrentes sobre la última unidad (POS + pedido online + traslado) → solo una tiene éxito |
| RNF-02 | **Rendimiento POS**: escanear < 500 ms; confirmar venta < 2 s |
| RNF-03 | **Disponibilidad**: horario comercial; contingencia sin internet por ubicación (ADR-005) |
| RNF-04 | **Seguridad**: HTTPS, hash de contraseñas y PIN, permisos por rol **y por ubicación** validados en el servidor |
| RNF-05 | **Auditoría**: usuario, ubicación y fecha en toda operación sensible |
| RNF-06 | **Respaldo**: backup diario del proveedor + `pg_dump` externo (≥ 30 días) y prueba de restauración mensual |
| RNF-07 | **Usabilidad**: POS con lector y teclado; vista móvil para las aprobaciones de Belén |
| RNF-08 | **Mantenibilidad**: TypeScript estricto; cobertura ≥ 90 % en `inventory`, `sales`, `transfers`, `orders` |
| RNF-09 | **Privacidad**: datos personales mínimos (Ley 19.628 / Ley 21.719) |
| RNF-10 | **Monitoreo de errores** en producción |
| RNF-11 | **Costo**: infraestructura ≤ ~$20.000 CLP al mes (ADR-010) |
| RNF-12 | **Tiempo de aprobación**: una solicitud remota llega a Belén en < 5 s (importante: todo descuento pasa por ella) |
