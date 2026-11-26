# Big Curvas – Sistema de Gestión de Inventario Centralizado

Proyecto Capstone del **Equipo 10** · Sección PTY4614-302D · Duoc UC, sede San Bernardo.

Sistema web que centraliza el **inventario, las ventas en tienda (POS) y los pedidos online** de **Big Curvas**, una tienda de ropa de tallas grandes de Rancagua que hasta ahora lleva su stock y sus ventas en Excel. La tienda opera con **una tienda física (Rancagua), una bodega** y ventas por **Instagram**.

**Demo en línea:** <https://big-curvas-demo.onrender.com> (datos de ejemplo; el servicio gratuito se duerme con la inactividad y la primera visita puede tardar unos 50 segundos).

> **Estado:** demo funcional completa (etapas 1 a 8), base de datos en Neon, autenticación real con contraseña y PIN, y **779 pruebas automáticas** aprobadas. Los cambios, devoluciones y vales están implementados con supuestos por validar con la clienta (todavía sin desplegar en la demo publicada); queda pendiente la puesta en producción con la clienta (ver [Limitaciones y próximos pasos](#limitaciones-y-próximos-pasos)).

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
| **Punto de venta** | Ventas con lector de código de barras, caja compartida, cuadratura y comprobante | ✅ |
| **Traslados** | Envíos entre bodega y tienda, con recepción escaneada y resolución de diferencias | ✅ |
| **Pedidos online** | Pedidos de Instagram: se apartan al pagar y salen desde la bodega | ✅ |
| **Aprobaciones** | La dueña autoriza descuentos, anulaciones y reembolsos desde su celular o con su PIN | ✅ |
| **Reportes** | Ventas por medio de pago, más vendidos, stock bajo, prendas sin rotación y lista del viernes | ✅ |
| **Acceso real** | Administradora con contraseña; vendedoras con PIN en el equipo de caja vinculado a su tienda | ✅ |
| **Cambios y devoluciones** | Devolución a vale, a dinero (con aprobación de la dueña) o cambio, con vales de saldo; los supuestos están marcados 🟡 y listados como preguntas para la clienta | ✅ 🟡 |

## Tecnologías

- **Next.js 16** + **TypeScript** (aplicación web full-stack)
- **PostgreSQL 17** + **Prisma** (base de datos y migraciones)
- **Tailwind CSS** + **shadcn/ui** (interfaz)
- **Vitest** (pruebas unitarias y de integración contra PostgreSQL real)
- **Docker** (base de datos local) · **Neon** (PostgreSQL de la demo) · **Render** (hosting de la aplicación)

---

## Estructura del repositorio

```
├── README.md                        Este archivo
├── render.yaml                      Blueprint de Render (despliegue de la demo)
├── big-curvas/                      Sistema: código, pruebas y documentación técnica
│   ├── src/                         Aplicación (Next.js) y lógica de negocio por módulos
│   ├── prisma/                      Esquema, migraciones y datos de ejemplo
│   ├── tests/                       Pruebas de integración contra PostgreSQL real
│   ├── scripts/                     Siembra, alta de usuarios y verificación de la base
│   └── docs/                        Requerimientos, arquitectura, modelo de datos, plan y decisiones
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
└── Fase 3/                          Cierre
    ├── Evidencias grupales/         Informe final, presentación y planilla de evaluación
    └── Evidencias individuales/     Diarios 3.1 y autoevaluaciones 3.2
```

### Nombres de los entregables

Se mantiene la convención de las fases anteriores:

| Tipo | Patrón | Ejemplo |
|------|--------|---------|
| Individual | `Apellido_Nombre_<n°>_APT122_<Nombre>Fase<N>.docx` | `Osorio_Martin_2.1_APT122_DiarioReflexionFase2.docx` |
| Grupal (guía o informe) | `<n°>_GuiaEstudiante_Fase_<N>_<Nombre>_APT_Equipo10.docx` | `2.6_GuiaEstudiante_Fase_2_Informe_Final_Proyecto_APT_Equipo10.docx` |
| Presentación | `Big_Curvas_Presentacion_Capstone_Fase<N>.pptx` | `Big_Curvas_Presentacion_Capstone_Fase1.pptx` |
| Planilla de evaluación | `PLANILLA DE EVALUACIÓN <ETAPA> FASE <N>.xlsx` | `PLANILLA DE EVALUACIÓN FINAL FASE 2.xlsx` |

Para la Fase 3 los individuales son `Apellido_Nombre_3.1_APT122_DiarioReflexionFase3.docx` (diario) y `Apellido_Nombre_3.2_APT122_AutoevaluacionFase3.docx` (autoevaluación). Los archivos `borrar luego` de las carpetas de la Fase 3 son marcadores y se eliminan cuando se sube el documento real.

---

## Cómo correr el sistema en local

Requisitos: **Node.js 24**, **pnpm 12** (`corepack enable` lo activa) y **Docker** (para PostgreSQL). Todos los comandos se ejecutan dentro de `big-curvas/`.

```bash
cd big-curvas
cp .env.example .env         # variables de entorno de ejemplo (DEMO_MODE=true)
docker compose up -d         # PostgreSQL 17 en el puerto 5432; crea también la BD de pruebas
pnpm install
pnpm db:migrate              # crea las tablas
pnpm db:seed:history         # datos de ejemplo con 8 semanas de ventas y pedidos
pnpm dev                     # http://localhost:3000
```

En la pantalla de ingreso aparece "Entrar como…" con tres usuarios de ejemplo (administradora y dos vendedoras). Con `DEMO_MODE=true` el acceso no pide contraseña: es solo para datos ficticios.

Para ejecutar las pruebas (necesitan Docker levantado):

```bash
pnpm test         # 779 pruebas (Vitest, contra PostgreSQL real)
pnpm test:demo    # las de la demo, como en el servicio publicado: sin AUTH_SECRET (643; 2 se saltan)
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
```

El detalle de las variables, los usuarios de demo y el login real está en [`big-curvas/README.md`](big-curvas/README.md) y en [`big-curvas/docs/CREDENCIALES.md`](big-curvas/docs/CREDENCIALES.md).

## Cómo se despliega

La demo corre en **Render** (servicio web gratuito) con la base de datos en **Neon** (PostgreSQL 17). El blueprint está en [`render.yaml`](render.yaml); las cadenas de conexión se pegan a mano en el panel de Render y nunca se guardan en el repositorio.

- Guía paso a paso, límites del plan gratuito, respaldo y recuperación: [`big-curvas/docs/DEPLOY_RENDER.md`](big-curvas/docs/DEPLOY_RENDER.md)
- Decisiones de despliegue y de autenticación (ADR-019 y ADR-020): [`big-curvas/docs/07_DECISIONES_Y_PREGUNTAS.md`](big-curvas/docs/07_DECISIONES_Y_PREGUNTAS.md)
- Variables de entorno y rotación de secretos: [`big-curvas/docs/CREDENCIALES.md`](big-curvas/docs/CREDENCIALES.md)

## Documentación técnica

Todo vive en [`big-curvas/docs/`](big-curvas/docs/00_README.md):

| Documento | Contenido |
|-----------|-----------|
| [Visión y alcance](big-curvas/docs/01_VISION_Y_ALCANCE.md) | Problema, objetivos, alcance y supuestos |
| [Requerimientos](big-curvas/docs/02_REQUERIMIENTOS.md) | Requerimientos funcionales, no funcionales y reglas de negocio |
| [Arquitectura](big-curvas/docs/03_ARQUITECTURA.md) | Módulos, flujos críticos, seguridad y despliegue |
| [Modelo de datos](big-curvas/docs/04_MODELO_DE_DATOS.md) | Entidades, relaciones e invariantes |
| [Plan de trabajo](big-curvas/docs/05_PLAN_DE_TRABAJO.md) | Estado real, hoja de ruta y preguntas abiertas con la clienta |
| [Decisiones y preguntas](big-curvas/docs/07_DECISIONES_Y_PREGUNTAS.md) | Registro de decisiones (ADR) y preguntas abiertas |
| [Plan de demostración](big-curvas/docs/DEMO_PLAN.md) | Guion y casos de prueba por etapa |

---

## Entregables de la Fase 2

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
| `feature/demo` | Rama de trabajo del sistema y de despliegue (Render). Contiene el código y los entregables del curso. |
| `main` | Rama por defecto del repositorio. Se actualiza desde `feature/demo` al cierre de cada etapa, sin reescribir el historial. |
| `develop` | Rama de integración de las primeras fases (sin cambios desde septiembre). |

El trabajo se hace en ramas cortas (`feat/NNN-nombre`, `fix/NNN-nombre`, `docs/NNN-nombre`) que entran por pull request, con commits en formato *Conventional Commits*.

---

## Avance del proyecto

**Fase 1 – Definición** ✅
- [x] Levantamiento de requerimientos con la clienta (31/08/2026)
- [x] Objetivos, metodología y plan de trabajo

**Fase 2 – Desarrollo** ✅
- [x] Reunión de validación con la clienta y ajuste del alcance (02/10/2026)
- [x] Arquitectura y modelo de datos (versión v0.4)
- [x] Demo funcional: inventario, punto de venta, traslados, pedidos online y aprobaciones

**Fase 3 – Cierre** (en curso)
- [x] Reportes y dashboard para la administradora (etapa 6.5)
- [x] Publicación de la demo en Render con la base en Neon (etapa 7, ADR-019)
- [x] Rediseño visual con criterios de accesibilidad (etapa 8)
- [x] Autenticación real: contraseña para la administradora y PIN en el equipo de caja (ADR-020)
- [ ] Pruebas de aceptación con la clienta y las vendedoras
- [x] Cambios, devoluciones y vales (etapa 9, ADR-021): implementados con supuestos 🟡; falta validarlos con la clienta y desplegarlos
- [ ] Manual de usuario, informe final, presentación y defensa

### Etapas del sistema

| Etapa | Contenido | Estado |
|:-----:|-----------|:------:|
| 1 | Base del proyecto, datos de ejemplo | ✅ |
| 2 | Servicio de inventario con control de concurrencia, matriz de stock y kardex | ✅ |
| 3 | Identidad visual y punto de venta por tienda | ✅ |
| 4 | Traslados entre tienda y bodega | ✅ |
| 5 | Pedidos online desde la bodega | ✅ |
| 6 | Aprobaciones remotas y con PIN | ✅ |
| 6.5 | Reportes y dashboard | ✅ |
| 7 | Pulido, publicación en Render y base de datos en Neon | ✅ |
| 8 | Rediseño visual | ✅ |
| 9 | Cambios, devoluciones y vales (supuestos 🟡 por validar con la clienta; sin desplegar) | ✅ |
| — | Autenticación real (contraseña, dispositivo de caja y PIN) | ✅ |

## Limitaciones y próximos pasos

- **Cambios y devoluciones** no están implementados: dependen de reglas que la clienta debe confirmar (plazos, vale o dinero, reembolso con tarjeta). Están listadas como preguntas abiertas en el [plan de trabajo](big-curvas/docs/05_PLAN_DE_TRABAJO.md).
- **La demo pública no pide contraseña** (modo demo): solo debe usarse con datos ficticios. El login real existe y se activa sin `DEMO_MODE`, pero todavía no se despliega un servicio con cuentas reales.
- **Servicio gratuito:** Render duerme la aplicación con la inactividad y Neon tiene límites de uso; no es una configuración de producción.
- **Seguridad pendiente:** sin segundo factor, sin recuperación de contraseña por correo y sin límite de intentos por dirección IP.
- **Producción real:** falta la carga inicial de ubicaciones, catálogo y stock con datos de la tienda, el etiquetado de las prendas y la integración con la app de boletas.
- **Pruebas de aceptación** con la clienta y las vendedoras antes de la puesta en marcha.

## Equipo 10

| Integrante | Rol |
|------------|-----|
| Martín Osorio | Líder de equipo, arquitectura y backend |
| Renato Espina | Aseguramiento de calidad (QA), pruebas y certificación, validación de devoluciones y cambios |
| Benjamín Rojas | Dashboards y reportes de ventas |

**Clienta:** Belén, dueña de Big Curvas (Rancagua).
