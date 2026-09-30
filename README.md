# Big Curvas – Sistema de Inventario y Ventas

Proyecto Capstone del **Equipo 10 (sección 302D)**, Duoc UC · Asignatura PTY4614.

Sistema web para centralizar el **inventario, las ventas en tienda (POS) y los pedidos online** de Big Curvas, una tienda de ropa en Chile con dos tiendas físicas (Rancagua y Providencia), una bodega y venta por Instagram.

---

##  Problema

- El stock de las tiendas, la bodega y el canal online no está integrado y se controla manualmente.
- Las ventas online se mezclan con las de tienda, lo que genera prendas vendidas dos veces, descuadres y demoras en los despachos.
- No hay trazabilidad de los movimientos entre ubicaciones ni reportes de ventas.

##  Solución

Un sistema único que lleva el stock **por prenda (talla y color) y por ubicación**, y lo actualiza en tiempo real con cada venta, traspaso o pedido.

| Módulo | Qué resuelve |
|--------|--------------|
| **Inventario** | Stock por ubicación, historial de movimientos (kardex), recepción de mercadería y conteos |
| **Traspasos** | Envío de prendas entre bodega y tiendas, con recepción confirmada y control de diferencias |
| **Punto de venta (POS)** | Ventas en tienda con lector de código de barras, caja y descuentos |
| **Pedidos online** | Pedidos de Instagram que se reservan y despachan desde la bodega, o se retiran en tienda |
| **Aprobaciones** | La administradora autoriza desde su celular los reembolsos y los descuentos especiales |
| **Reportes** *(próximamente)* | Ventas diarias, semanales y mensuales, y análisis de productos |

##  Tecnologías

- **Next.js** + **TypeScript** (aplicación web full-stack)
- **PostgreSQL** + **Prisma** (base de datos y migraciones)
- **Tailwind CSS** + **shadcn/ui** (interfaz)
- **Vitest** (pruebas automáticas)
- **Docker** (base de datos local)
- Desarrollo asistido por IA con **Claude Code**

##  Estructura del repositorio

```
├── Fase 1/        Entregables del curso – Fase 1
├── Fase 2/        Entregables del curso – Fase 2
├── Fase 3/        Entregables del curso – Fase 3
└── big-curvas/    Código del sistema y documentación técnica (rama feature/demo)
```

##  Ramas

| Rama | Uso |
|------|-----|
| `main` | Entregas del curso y versiones estables |
| `develop` | Integración del sistema (código probado) |
| `feature/*` | Desarrollo de funcionalidades (actualmente `feature/demo`) |

##  Estado del proyecto

- [x] Levantamiento de requerimientos y arquitectura
- [x] Base técnica del proyecto (Etapa 1 de la demo)
- [ ] Demo funcional: inventario, POS, traspasos, pedidos online y aprobaciones
- [ ] Validación con el cliente
- [ ] Salida a producción (etapa 1: tiendas y bodega)
- [ ] Pedidos online completos y reportes

##  Equipo 10

| Integrante | Rol |
|------------|-----|
| Martín Osorio | [Rol] |
| Renato Espina | [Rol] |
| Benjamín Rojas | [Rol] |

