# 01 – Visión y alcance

## 1. Contexto

Big Curvas es una tienda de ropa de tallas grandes que vende en **una tienda física en Rancagua** y por **canal online** (principalmente Instagram, con pedidos coordinados **a mano**). **No existe un sistema**: el stock y las ventas se llevan en **Excel**, separadas por medio de pago.

**Estructura operativa (validada con la clienta el 2026-10-02):**

| Ubicación | Tipo | Función |
|-----------|------|---------|
| **Tienda Rancagua** | Tienda | Venta presencial (POS). Caja compartida por las vendedoras |
| **Bodega** (casa de Belén, en preparación) | Bodega, sin atención de público | Guarda el stock destinado a **online** y despacha **solo los pedidos online** |

- Belén (dueña) administra el sistema, atiende Instagram, opera la bodega y traslada mercadería entre la bodega y la tienda **en su vehículo, los viernes**.
- La mercadería de proveedores llega **a la tienda o a la bodega** según el caso, generalmente **los viernes**.
- Hoy lo online sale de la tienda. **Cuando el sistema parta, saldrá desde la bodega.**

## 2. Problema

| # | Problema | Consecuencia |
|---|----------|--------------|
| 1 | Las ventas online descuentan del stock de la tienda sin control | Prendas vendidas dos veces, descuadres |
| 2 | Pedidos de tienda y online se mezclan | Errores y demoras en los despachos |
| 3 | Gestión en Excel manual | Sin automatización, sin trazabilidad, sin reportes de venta |
| 4 | Stock repartido entre tienda y bodega, con movimientos semanales | Sin un sistema no se sabe dónde está cada prenda ni qué se trasladó |

## 3. Objetivo general

Desarrollar un sistema centralizado de gestión de inventario y ventas para Big Curvas que integre el stock de la tienda, la bodega y el canal online, con control unificado, trazabilidad de los traslados y actualización en tiempo real.

## 4. Objetivos específicos y cómo se miden

| # | Objetivo | Indicador de éxito (propuesto, validar con Belén) |
|---|----------|-----------------------------------------------------|
| O1 | Centralizar el inventario de la tienda y la bodega en una base de datos única | 100 % de las variantes con stock por ubicación en el sistema |
| O2 | Actualizar el stock en tiempo real con cada venta, traslado y pedido | Toda operación mueve stock en < 2 s |
| O3 | Reducir errores y demoras de despacho | 0 pedidos online con prenda "vendida dos veces"; diferencia de conteo vs. sistema < 2 % por ubicación |
| O4 | Controlar los traslados semanales | 100 % de los traslados con recepción confirmada |
| O5 | Dashboards de ventas y análisis de productos | Reportes diario, semanal y mensual sin trabajo manual (post-MVP) |

## 5. Modelo operativo del sistema

- **Stock por ubicación física**: `TIENDA_RANCAGUA` y `BODEGA`. El modelo permite sumar ubicaciones en el futuro.
- **La tienda vende solo su stock** en el POS. Las vendedoras pueden **consultar** el stock de la bodega, pero no moverlo.
- **El canal online sale de la bodega** (ADR-004 v3). La prenda se aparta **al confirmar el pago**. Si no hay en bodega pero sí en la tienda, se aparta en la tienda y se genera un **traslado tienda → bodega**.
- **Recepción de proveedores** en la tienda o en la bodega.
- **Traslados con envío y recepción confirmada**, normalmente los viernes, a cargo de Belén.
- **Todas las prendas se etiquetan** con código de barras: el del proveedor (jeans) o uno propio (ADR-018).
- **Solo Belén** da descuentos, aprueba reembolsos y anula ventas: desde su celular o con su PIN si está en la tienda.

## 6. Alcance del MVP

1. **Usuarios, roles y ubicaciones**: Admin (Belén, que también opera la bodega) y Vendedora (Tienda Rancagua). El rol Bodega queda disponible por si se contrata a alguien.
2. **Catálogo**: productos, variantes (talla/color), SKU, códigos de barra (del proveedor o propios) e **impresión de etiquetas**.
3. **Inventario**: stock por variante y ubicación, movimientos, ajustes, recepción de proveedores (tienda o bodega), **traslados con tránsito**, conteos y carga inicial (desde el Excel actual y conteo físico).
4. **POS en la tienda**: venta con lector, efectivo/tarjeta/transferencia, redondeo del efectivo, caja compartida, ticket interno.
5. **Aprobaciones de Belén** (remotas o con PIN): descuentos, reembolsos y anulaciones.
6. **Cambios y devoluciones** (reglas por validar, P-09).
7. **Pedidos online**: los registra Belén; se apartan al pagar en la bodega (o en la tienda con traslado); se preparan y despachan desde la bodega.
8. **Reportes básicos**: ventas del día por medio de pago, cierre de caja, stock por ubicación, traslados en tránsito, kardex.

## 7. Fuera del MVP

| Módulo | Fase propuesta | Nota |
|--------|---------------|------|
| Dashboards y análisis de productos | Post-MVP 1 | Los datos se capturan desde el MVP |
| Reposición sugerida bodega ↔ tienda | Post-MVP 1 | |
| Órdenes de compra a proveedores | Post-MVP 2 | En el MVP, recepción simple |
| Integración con la app de boletas (Vessi u otra) | Post-MVP | Hoy emiten boletas con su app; en el MVP se registra el N° de boleta o voucher |
| Tienda web / e-commerce | Post-MVP 3 | Se conecta a las reservas de bodega |
| Promociones por cantidad (2x1, 3x2) | Post-MVP | En el MVP, % o monto, por canal |
| Integración con Transbank/BancoEstado y couriers | Post-MVP | En el MVP se registran los datos a mano |
| Segunda tienda | Futuro | El modelo de datos ya lo soporta |
| POS offline | No planificado | ADR-005 |

## 8. Usuarios y roles

| Usuario | Rol | Ubicación | Uso principal |
|---------|-----|-----------|---------------|
| Belén | **Admin** (dueña) | Todas | Todo: catálogo, precios, promociones, costos, ajustes, reportes, usuarios, **Instagram y pedidos online, operación de la bodega y traslados**, aprobaciones y descuentos |
| Vendedoras | **Vendedora** | Tienda Rancagua | POS (caja compartida), cambios, recepción de proveedores y de traslados en la tienda. Consultan el stock de la bodega |
| (Futuro) | **Bodega** | Bodega | Por si se contrata a alguien para la bodega |

## 9. Datos y supuestos

Confirmados:
- 1 tienda (Rancagua) y 1 bodega (casa de Belén, en preparación). No hay tienda en Providencia.
- Registro actual en Excel. Registrados en el SII; boletas con una app ("Veci", probablemente Vessi) y máquinas Transbank y BancoEstado; sin facturas.
- 3 medios de pago: efectivo, tarjeta y transferencia.
- Solo los jeans traen código de barras; se etiquetará todo.
- Precios con IVA incluido. Ofertas por canal: solo online o en ambos.
- Rancagua tiene fibra estable y un PC en caja.
- Presupuesto mínimo para servicios (≤ ~$20.000 CLP al mes).

Pendientes: catálogo (cantidad de modelos, tallas), volúmenes de venta, internet y equipos en la bodega, cambios y devoluciones, envíos, reportes deseados (ver doc 07).
