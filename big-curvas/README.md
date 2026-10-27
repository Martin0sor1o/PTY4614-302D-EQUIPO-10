# Big Curvas

Sistema de **inventario, punto de venta (POS) y pedidos online** para una tienda de ropa en Chile. Lleva el stock por prenda y por ubicación (**Tienda Rancagua** y **Bodega**), registra las ventas de la tienda, gestiona los pedidos que llegan por Instagram y WhatsApp, y le da a la administradora (Belén) las aprobaciones y los reportes que necesita.

Este repositorio contiene la **demo funcional**: todo corre con datos de ejemplo y un acceso sin contraseña ("Entrar como…").

## Qué incluye la demo

- **Stock** por ubicación en tiempo real (físico, reservado, en tránsito y por resolver) y kardex de cada prenda.
- **POS** de la tienda: escaneo de códigos, efectivo / débito-crédito / transferencia, caja compartida y comprobante.
- **Traslados** entre la tienda y la bodega, con recepción escaneada y resolución de diferencias.
- **Pedidos online**: se aparta al confirmar el pago (en la bodega o, si falta, en la tienda con traslado automático), preparación, despacho por courier y cancelación con reembolso.
- **Aprobaciones**: los descuentos, anulaciones y reembolsos de una vendedora requieren la aprobación de Belén, desde el celular o con su PIN.
- **Reportes** (solo Belén): ventas por medio de pago, más vendidos, stock bajo, prendas sin rotación y lista del viernes.
- **Guion de demo** en la pantalla de inicio (solo con `DEMO_MODE=true`) con los pasos de la presentación.

## Cómo levantarlo en local

Requisitos: **Node.js 24**, **pnpm 12** (`corepack enable` lo activa) y **Docker** (para PostgreSQL).

```bash
# 1. Variables de entorno
cp .env.example .env

# 2. Base de datos local (PostgreSQL 17 en el puerto 5432; crea también la BD de tests)
docker compose up -d

# 3. Dependencias
pnpm install

# 4. Tablas
pnpm db:migrate

# 5. Datos de ejemplo
pnpm db:seed:history

# 6. Servidor de desarrollo → http://localhost:3000
pnpm dev
```

Variables de `.env` (ver `.env.example`):

| Variable | Para qué sirve |
|---|---|
| `DATABASE_URL` | Base de datos de la app. |
| `TEST_DATABASE_URL` | Base de datos de los tests de integración (no se mezcla con la de desarrollo). |
| `DEMO_MODE` | `true` habilita el acceso sin contraseña, el guion de demo y el botón de reinicio. En cualquier otro caso la demo queda deshabilitada. |
| `DEMO_SEED_HISTORY` | Opcional. `false` hace que la primera siembra y el reinicio carguen solo los datos base, sin el historial de ventas. |

### Datos de ejemplo

- `pnpm db:seed` carga solo los **datos base** (ubicaciones, usuarios, ~20 productos y su stock). Los casos de `docs/DEMO_PLAN.md` con números como `TR-000001` o `PED-000001` calzan **solo con este seed**.
- `pnpm db:seed:history` agrega además **8 semanas de ventas y pedidos** (unos 20 segundos), para que los reportes tengan qué mostrar. Los números de documentos nuevos continúan después del historial, así que los traslados y pedidos que crees no parten en `TR-000001` ni `PED-000001`.
- Ambos comandos **borran todos los datos** y los vuelven a cargar. Solo funcionan con `DEMO_MODE=true`.
- En la pantalla de inicio, Belén tiene el botón **Reiniciar datos de demo**, que vuelve al seed con historial.

### Usuarios de demo

La pantalla de login (`/login`) muestra "Entrar como…":

| Usuario | Rol | Ubicación | Qué hace |
|---|---|---|---|
| Belén | Administradora | Todas (elige dónde opera) | Bodega, pedidos, aprobaciones, reportes. PIN de aprobación presencial: `2468` |
| Vendedora Rancagua | Vendedora | Tienda Rancagua | POS, caja, traslados de su tienda |
| Vendedora 2 Rancagua | Vendedora | Tienda Rancagua | Igual que la anterior; comparte la caja |

> Estos usuarios y el PIN son datos de ejemplo. Una demo publicada **no tiene contraseñas**: úsala solo con datos ficticios.

## Tests

Los tests de integración usan PostgreSQL real, así que Docker debe estar levantado (`docker compose up -d`).

```bash
pnpm test         # toda la suite (Vitest)
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
```

## Estructura de carpetas

```
big-curvas/
  docker-compose.yml        PostgreSQL local
  .env.example              variables de entorno de ejemplo
  prisma/                   esquema, migraciones y seed
  scripts/                  demo-bootstrap.ts: siembra inicial en el hosting (solo si la BD está vacía)
  docs/                     documentación del proyecto
  src/
    app/                    pantallas (Next.js App Router) y /api/health
    components/             componentes de UI (shadcn/ui) y de cada pantalla
    lib/                    dinero (CLP), fechas (America/Santiago), accesos, errores
    modules/                lógica de negocio; cada módulo expone su API en index.ts
      inventory/            stock, movimientos, reservas y traslados (único que escribe stock)
      sales/                ventas del POS, caja, precios y descuentos
      orders/               pedidos online
      approvals/            aprobaciones remotas y con PIN
      reports/              reportes (solo lectura)
      auth/ customers/ locations/ numbering/ demo/ system/
  tests/integration/        tests contra PostgreSQL real
```

## Tecnologías

Next.js (App Router) · TypeScript · Tailwind CSS + shadcn/ui · Prisma + PostgreSQL · Zod · Vitest · pnpm.

## Publicar la demo en internet

La demo se publica en Render con planes gratuitos. El archivo `render.yaml` está en la raíz del repositorio y la guía paso a paso en [`docs/DEPLOY_RENDER.md`](docs/DEPLOY_RENDER.md).

## Documentación

Toda la documentación está en la carpeta [`docs/`](docs/00_README.md): visión y alcance, requerimientos, arquitectura, modelo de datos, plan de trabajo, decisiones y el [plan de la demo](docs/DEMO_PLAN.md).
