# Big Curvas – Sistema de Gestión de Inventario Centralizado

Proyecto Capstone del **Equipo 10** · Sección PTY4614-302D · Duoc UC, sede San Bernardo.

Sistema web que centraliza el **inventario, las ventas en tienda (POS) y los pedidos online** de **Big Curvas**, una tienda de ropa de tallas grandes de Rancagua que hoy lleva su stock y sus ventas en Excel. La tienda opera con **una tienda física (Rancagua), una bodega** y ventas por **Instagram**.

> **Estado:** Fase 2 terminada. La demo funcional (etapas 1 a 6) está en la rama [`feature/demo`](https://github.com/Martin0sor1o/PTY4614-302D-EQUIPO-10/tree/feature/demo/big-curvas), con 307 pruebas automáticas aprobadas.

---

## Problema

- El stock de la tienda, la bodega y el canal online no está integrado: se lleva a mano en Excel.
- Las ventas online y las de tienda usan las mismas prendas sin un stock común, lo que genera prendas vendidas dos veces y descuadres.
- No hay trazabilidad de los traslados entre la bodega y la tienda, y el cierre de caja y los reportes se calculan a mano.

## Solución

Un sistema único que lleva el stock **por prenda (talla y color) y por ubicación**, y lo actualiza en el momento de cada venta, pedido pagado o traslado.

| Módulo | Qué resuelve | Estado |
|--------|--------------|:------:|
| **Inventario** | Stock por ubicación, disponible = físico − reservado, historial de movimientos (kardex) | ✅ |
| **Punto de venta** | Ventas con lector de código de barras, caja compartida, cuadratura y ticket | ✅ |
| **Traslados** | Envíos entre bodega y tienda, con recepción escaneada y control de diferencias | ✅ |
| **Pedidos online** | Pedidos de Instagram: se apartan al pagar y salen desde la bodega | ✅ |
| **Aprobaciones** | La dueña autoriza descuentos, anulaciones y reembolsos desde su celular o con PIN | ✅ |
| **Cambios y devoluciones** | Reglas pendientes de validar con la clienta | Fase 3 |
| **Reportes y dashboards** | Ventas diarias, semanales y mensuales por medio de pago | Fase 3 |

## Tecnologías

- **Next.js 16** + **TypeScript** (aplicación web full-stack)
- **PostgreSQL 17** + **Prisma** (base de datos y migraciones)
- **Tailwind CSS** + **shadcn/ui** (interfaz)
- **Vitest** (pruebas unitarias y de integración contra PostgreSQL real)
- **Docker** (base de datos local)

---

## Estructura del repositorio

```
├── Fase 1/                          Definición del proyecto
│   ├── Evidencias grupales/         Guía 1.5, formativa 1.4, presentación y planilla de evaluación
│   └── Evidencias individuales/     Autoevaluaciones y diarios de reflexión
├── Fase 2/                          Desarrollo del proyecto
│   ├── Evidencias grupales/         Guía 2.4 (avance), informe final 2.6 y planillas de evaluación
│   ├── Evidencias individuales/     Diarios de reflexión de la Fase 2
│   └── Evidencias proyecto/
│       ├── Evidencias documentación/  Requerimientos y arquitectura, reunión con la clienta
│       ├── Evidencias sistema/        Código fuente, evidencias de la app, pruebas y base de datos
│       └── Presentación/              Presentación final y video de la demo
└── Fase 3/                          Cierre (próximamente)
```

### Entregables de la Fase 2

| Tipo | Documento |
|------|-----------|
| Avance | [2.4 Desarrollo del proyecto](Fase%202/Evidencias%20grupales/2.4_GuiaEstudiante_Fase_2_DesarrolloProyecto_APT_Equipo10.docx) |
| Informe final | [2.6 Informe final del proyecto](Fase%202/Evidencias%20grupales/2.6_GuiaEstudiante_Fase_2_Informe_Final_Proyecto_APT_Equipo10.docx) |
| Documentación | [Requerimientos y arquitectura](Fase%202/Evidencias%20proyecto/Evidencias%20documentaci%C3%B3n/D1_Requerimientos_y_Arquitectura_Big_Curvas.pdf) · [Reunión de validación con la clienta](Fase%202/Evidencias%20proyecto/Evidencias%20documentaci%C3%B3n/D2_Reunion_de_validacion_con_la_clienta.pdf) |
| Aplicación | [Código fuente](Fase%202/Evidencias%20proyecto/Evidencias%20sistema/A1_Codigo_fuente_Big_Curvas.pdf) · [Evidencias de la aplicación](Fase%202/Evidencias%20proyecto/Evidencias%20sistema/A2_Evidencias_de_la_aplicacion_Big_Curvas.pdf) · [Informe de pruebas](Fase%202/Evidencias%20proyecto/Evidencias%20sistema/A3_Informe_de_pruebas_automaticas_Big_Curvas.pdf) |
| Base de datos | [Modelo de datos](Fase%202/Evidencias%20proyecto/Evidencias%20sistema/B1_Modelo_de_datos_Big_Curvas.pdf) · [Diccionario de datos](Fase%202/Evidencias%20proyecto/Evidencias%20sistema/B2_Diccionario_de_datos_Big_Curvas.xlsx) · [Script SQL](Fase%202/Evidencias%20proyecto/Evidencias%20sistema/B3_Script_base_de_datos_Big_Curvas.sql) |
| Presentación | [Presentación final](Fase%202/Evidencias%20proyecto/Presentaci%C3%B3n/Presentacion_Ensayo_Final_Big_Curvas2.pptx) · [Video de la demo](Fase%202/Evidencias%20proyecto/Presentaci%C3%B3n/Demo_Big_curvas.mkv) |

## Ramas

| Rama | Contenido |
|------|-----------|
| `main` | Entregables del curso por fase (esta rama) |
| `feature/demo` | Código del sistema y documentación técnica, en la carpeta [`big-curvas/`](https://github.com/Martin0sor1o/PTY4614-302D-EQUIPO-10/tree/feature/demo/big-curvas) |
| `develop` | Integración del sistema |

### Ejecutar la demo

```bash
git checkout feature/demo
cd big-curvas
docker compose up -d        # PostgreSQL 17 local
cp .env.example .env
pnpm install
pnpm db:migrate             # crea las tablas
pnpm db:seed                # carga los datos de ejemplo
pnpm dev                    # http://localhost:3000
pnpm test                   # 307 pruebas automáticas
```

---

## Avance del proyecto

**Fase 1 – Definición** ✅
- [x] Levantamiento de requerimientos con la clienta (31/08/2026)
- [x] Objetivos, metodología y plan de trabajo

**Fase 2 – Desarrollo** ✅
- [x] Reunión de validación con la clienta y ajuste del alcance (02/10/2026)
- [x] Arquitectura y modelo de datos (versión v0.4)
- [x] Demo funcional: inventario, punto de venta, traslados, pedidos online y aprobaciones
- [x] 307 pruebas automáticas aprobadas (33 archivos)

**Fase 3 – Cierre**
- [ ] Publicación de la demo y pruebas de aceptación con la clienta y las vendedoras
- [ ] Reportes y dashboards
- [ ] Cambios y devoluciones
- [ ] Manual de usuario, presentación y defensa

## Equipo 10

| Integrante | Rol |
|------------|-----|
| Martín Osorio | Líder de equipo, arquitectura y backend |
| Renato Espina | Aseguramiento de calidad (QA), pruebas y certificación |
| Benjamín Rojas | Dashboards y reportes de ventas |

**Clienta:** Belén, dueña de Big Curvas (Rancagua).
