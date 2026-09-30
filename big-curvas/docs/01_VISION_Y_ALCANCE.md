# 01 – Visión y alcance

## 1. Contexto

Big Curvas es una tienda de ropa que vende en **tiendas físicas** y por **canal online**. El canal online hoy funciona principalmente por **Instagram**, con pedidos tomados y coordinados **a mano** (mensajes directos, transferencia, despacho). **No existe un sistema previo**: el control de stock y ventas es manual.

**Estructura operativa (actualizada 2026-09-29):**

| Ubicación | Tipo | Función |
|-----------|------|---------|
| **Tienda Rancagua** | Tienda | Venta presencial (POS) |
| **Tienda Providencia** (nueva, ya abierta) | Tienda | Venta presencial (POS) |
| **Bodega** | Bodega (sin atención de público) | Almacenamiento, recepción de proveedores, abastecimiento de tiendas y **origen único de los pedidos online** |

## 2. Problema

| # | Problema | Consecuencia |
|---|----------|--------------|
| 1 | Las ventas online descuentan del stock de la tienda, sin control | Se venden prendas que ya no están, descuadres de stock |
| 2 | Pedidos de tienda y online se mezclan | Errores y demoras en el despacho |
| 3 | Gestión manual, sin sistema | Sin automatización, sin trazabilidad, sin reportes de venta |
| 4 | Ahora son 3 ubicaciones (2 tiendas + bodega) con movimientos entre ellas | Sin un sistema, es imposible saber dónde está cada prenda ni controlar lo que viaja entre locales |

## 3. Objetivo general

Desarrollar un sistema centralizado de gestión de inventario y ventas para Big Curvas que integre el stock de las dos tiendas, la bodega y el canal online, con control unificado, trazabilidad de traspasos y actualización en tiempo real.

## 4. Objetivos específicos y cómo se miden

| # | Objetivo | Indicador de éxito (propuesto, validar con Belén) |
|---|----------|-----------------------------------------------------|
| O1 | Centralizar el inventario de las 3 ubicaciones en una base de datos única | 100 % de variantes con stock por ubicación en el sistema |
| O2 | Actualizar el stock en tiempo real con cada venta, traspaso y pedido | Toda operación mueve stock en < 2 s |
| O3 | Reducir errores y demoras de despacho | 0 pedidos online con prenda "vendida dos veces"; diferencia de conteo físico vs sistema < 2 % por ubicación |
| O4 | Controlar los traspasos entre ubicaciones | 100 % de traspasos con recepción confirmada; alerta si un traspaso lleva más de X días en tránsito |
| O5 | Dashboards de ventas y análisis de productos, por tienda y consolidados | Reportes diario/semanal/mensual sin trabajo manual (post-MVP) |

## 5. Modelo operativo (resumen)

- **Stock por ubicación física**: `TIENDA_RANCAGUA`, `TIENDA_PROVIDENCIA`, `BODEGA`.
- **Cada tienda vende solo su propio stock** en su POS. Las vendedoras pueden **consultar** el stock de las otras ubicaciones, pero no moverlo.
- **El canal online sale solo de la bodega** (ADR-004 v2). Al registrar un pedido se reservan unidades en la bodega. Si no hay en bodega pero sí en una tienda, se reserva en esa tienda y, una vez pagado el pedido, se genera un **traspaso tienda → bodega**.
- **Recepción de proveedores** en la bodega o directamente en una tienda.
- **Traspasos con envío y recepción confirmada**: el origen despacha (queda "en tránsito") y el destino escanea y confirma lo recibido. Las diferencias quedan registradas.
- **Retiro en tienda de pedidos online**: la bodega prepara el pedido y lo envía a la tienda elegida, donde la clienta lo retira.
- **Autorizaciones remotas**: Belén aprueba desde su celular los reembolsos, las anulaciones y los descuentos sobre el límite.

## 6. Alcance del MVP

1. **Usuarios, roles y ubicaciones**: Admin (Belén), Vendedora (fija en una tienda) y Bodega.
2. **Catálogo**: productos, variantes (talla/color), SKU y código de barras, etiquetas.
3. **Inventario multi-ubicación**: stock por variante × ubicación, movimientos, ajustes, recepción de proveedores (en bodega o tienda), **traspasos con tránsito**, conteos por ubicación, carga inicial.
4. **POS por tienda**: venta con lector, medios de pago, descuentos, promociones, redondeo de efectivo, caja por tienda, ticket.
5. **Autorizaciones remotas** de Belén.
6. **Cambios y devoluciones** en cualquier tienda, incluidos los de pedidos online.
7. **Pedidos online** (Instagram): los registra Belén, se reservan en bodega (o en tienda con traspaso), se preparan y despachan desde bodega o se envían a una tienda para retiro.
8. **Reportes básicos**: ventas del día por tienda, cierre de caja, stock por ubicación y consolidado, stock en tránsito, kardex.

## 7. Fuera del MVP (siguientes fases)

| Módulo | Fase propuesta | Nota |
|--------|---------------|------|
| Dashboards (diario/semanal/mensual, por tienda y consolidado, análisis de productos) | Post-MVP 1 | Los datos se capturan desde el MVP |
| Reposición sugerida bodega → tiendas (stock mínimo por tienda) | Post-MVP 1 | Muy útil con bodega; requiere historial de ventas |
| Proveedores: órdenes de compra, recepción contra OC | Post-MVP 2 | En el MVP, recepción simple con proveedor opcional |
| Facturación/boleta electrónica SII integrada | Por confirmar (P-04) | Puede tener que adelantarse (R-02). Con dos tiendas, cada una es una sucursal ante el SII |
| Tienda web / e-commerce | Post-MVP 3 | Se conecta a las reservas de bodega |
| Integración API de Instagram / Meta | Post-MVP | |
| Promociones por cantidad (2x1, 3x2) | Post-MVP | En el MVP: % o monto |
| Notificaciones push al celular de Belén | Deseable | En el MVP, aviso dentro de la app |
| Integración con terminal Transbank y couriers | Post-MVP | En el MVP se registran datos a mano |
| Venta en una tienda con retiro o despacho desde otra ubicación | Post-MVP | En el MVP, la vendedora consulta el stock y deriva el caso a Belén o a Instagram |
| POS offline | No planificado | ADR-005 |

## 8. Usuarios y roles

| Usuario | Rol | Ubicación | Uso principal |
|---------|-----|-----------|---------------|
| Belén | **Admin** (dueña) | Todas | Todo: catálogo, precios, promociones, costos, ajustes, reportes, usuarios. **Atiende Instagram y registra los pedidos online.** Aprueba solicitudes remotas |
| Vendedoras | **Vendedora** | **Una tienda fija** | POS, cambios, recepción de proveedores y de traspasos en su tienda, envío de traspasos desde su tienda, entrega de pedidos para retiro. Consulta el stock de otras ubicaciones |
| Persona de bodega | **Bodega** | Bodega | Recepción de proveedores, etiquetado, traspasos, preparación y despacho de pedidos online, conteos de bodega |

## 9. Datos y supuestos

Confirmados:
- Tres ubicaciones: 2 tiendas y 1 bodega. Providencia ya está abierta.
- Catálogo de 50–300 modelos, unas 750–4.500 variantes estimadas. Entre 20 y 100 ventas al día en total (a revalidar con dos tiendas, P-06).
- Precios con IVA incluido y **precios y promociones iguales en todas las tiendas**.
- Rancagua tiene fibra estable. Rancagua, Providencia y la bodega tienen PC/notebook. Faltan lectores e impresoras.
- Pagos con tarjeta vía Transbank. Presupuesto mínimo para servicios (≤ ~$20.000 CLP al mes).

Pendientes: internet en Providencia y en la bodega (P-20), ubicación de la bodega (P-19).
