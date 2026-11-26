# Publicar la demo (Render + Neon)

Guía paso a paso para dejar la demo de Big Curvas en internet y abrirla desde cualquier computador o celular. Usa **planes gratuitos**: el servicio web en [Render](https://render.com) y la base de datos PostgreSQL en [Neon](https://neon.com) (ADR-019). El servicio se declara en `render.yaml` (en la raíz del repositorio); la base de datos **ya no está en el Blueprint** y se crea a mano en Neon.

> **Aviso:** la demo publicada entra **sin contraseña** (`DEMO_MODE=true`). Cualquiera que tenga el enlace puede entrar y modificar los datos. Debe tener **solo datos de ejemplo**. El login lo avisa con "Demo con datos ficticios".

> **Esto es solo para demo y staging.** La base de producción real sigue siendo la del ADR-010 (Render Postgres de pago, con respaldo externo) y es una decisión futura de Belén y el equipo.

## Qué se crea

| Recurso | Dónde | Nombre | Plan | Región |
|---|---|---|---|---|
| Servicio web (Node.js, Next.js) | Render | `big-curvas-demo` | Free | Oregon |
| Base de datos PostgreSQL 17 | Neon | `big-curvas-demo` (base `big_curvas`) | Free | AWS US West 2 (Oregon) |

- **Por qué Oregon para la base:** quien consulta la base es el servicio web (Render, Oregon), no el navegador. Con la base en la misma región cada consulta tarda ~1 ms (estimado, no medido); en São Paulo serían ~170 ms por consulta (estimado, no medido) y el seed (miles de consultas) se alargaría mucho. La región de un proyecto de Neon no se puede cambiar después de crearlo.
- **Rama que se publica:** `feature/demo`, carpeta `big-curvas/`.
- **Variables de entorno del servicio:**

  | Variable | Valor | Quién la define |
  |---|---|---|
  | `NODE_VERSION` | `24` | `render.yaml` |
  | `DEMO_MODE` | `true` | `render.yaml` |
  | `DATABASE_URL` | Cadena **pooled** de Neon (el host lleva `-pooler`) | Se pega a mano en Render (`sync: false`) |
  | `DIRECT_URL` | Cadena **directa** de Neon (sin `-pooler`) | Se pega a mano en Render (`sync: false`) |
  | `DEMO_ADMIN_PIN` | Opcional. PIN (4 a 6 dígitos que tú eliges) de Belén en la demo; **no está en el repositorio** | Se pega a mano en Render (ver "PIN de la demo") |

  `AUTH_SECRET` **no** hace falta en este servicio: solo se exige donde hay login real (ver `docs/CREDENCIALES.md`). Todo lo que corre en la demo debe funcionar sin ella. **Antes de desplegar:** `pnpm test:all`; su segunda pasada (`pnpm test:demo`) corre sin `AUTH_SECRET`, como este servicio. En la demo, vincular equipos de caja (Ajustes → Dispositivos y `/vincular`) responde que no está disponible. Los errores inesperados quedan en el log del servicio con la marca `[error inesperado]`, sin códigos, contraseñas ni tokens.

  **Las cadenas de conexión son secretos:** nunca van en el repositorio (es público), en commits, en el chat ni en capturas de pantalla. Las dos llevan `sslmode=require`.
- **Cuál se usa para qué:** la app y la siembra usan `DATABASE_URL` (pooled). `prisma migrate deploy` usa `DIRECT_URL` (`prisma.config.ts`), porque las migraciones toman un *advisory lock* que no funciona a través del pooler de Neon. Si `DIRECT_URL` no existe, el CLI usa `DATABASE_URL` (así funciona en local).
- **Al arrancar**, el servicio aplica las migraciones, **carga los datos de ejemplo con historial solo la primera vez** (si la base está vacía) y levanta la app.
- **Health check:** `/api/health` responde `{"status":"ok","database":"up"}`.

## Antes de empezar

1. Tener una cuenta de **GitHub** con acceso al repositorio y cuentas en **Render** y **Neon** (ambas sin tarjeta).
2. Que la rama `feature/demo` esté subida a GitHub **con el archivo `render.yaml` en la raíz**.

## Paso a paso

1. **Crear el proyecto en Neon.** En [console.neon.tech](https://console.neon.tech) → **Create project**:
   - Nombre: `big-curvas-demo`.
   - Región: **AWS US West 2 (Oregon)**.
   - **Postgres version: 17.** Neon propone la más nueva (hoy 18) por omisión: cámbiala a mano.
   - Nombre de la base: `big_curvas`.
   - Plan Free (no pide tarjeta).
2. **Copiar las dos cadenas.** En el proyecto pulsa **Connect**, deja la base `big_curvas` y el rol `big_curvas_owner`:
   - Con **Connection pooling activado** → copia la cadena **pooled**.
   - Con **Connection pooling desactivado** → copia la cadena **directa**.
   - Si alguna trae `&channel_binding=require` al final, **bórralo** (el pooler no lo soporta). Debe quedar `?sslmode=require`.
3. **Crear el servicio en Render.** **New +** → **Blueprint** → elige el repositorio y la rama **`feature/demo`**. `DATABASE_URL` y `DIRECT_URL` están en `sync: false`, así que Render no las trae del archivo: si te pide los valores al aplicar, pega la pooled y la directa; si no, agrégalas después en el servicio → **Environment** (el servicio no arranca bien sin ellas). Pulsa **Apply**. *(El camino de crear el Blueprint desde cero con la base en Neon no se probó en este paso a paso: la demo actual migró un servicio ya existente, como indica la línea siguiente.)*
   - Si el servicio ya existe y solo cambias de base de datos (así se hizo el 24/11/2026): servicio → **Environment** → **Edit** → reemplaza `DATABASE_URL`, agrega `DIRECT_URL` → **Save, rebuild, and deploy**.
4. **Esperar el build.** La primera vez toma varios minutos. Entra al servicio → **Logs** y busca, en este orden:
   - `Datasource "db": PostgreSQL database "big_curvas" … at "ep-….neon.tech"` (el host **sin** `-pooler`: es la conexión directa) y `All migrations have been successfully applied.` (en los arranques siguientes dice `No pending migrations to apply.`).
   - `[demo:bootstrap] Datos de demo cargados en N s (con historial: …)`. **Anota ese N** (ver "Tiempos").
   - `✓ Ready` de Next.js y `Your service is live`.
5. **Abrir la URL.** Arriba, en el servicio, aparece el enlace `https://big-curvas-demo.onrender.com` (si el nombre ya estaba ocupado, Render le agrega letras al final).
6. **Probar.**
   - `https://…onrender.com/api/health` debe mostrar `{"status":"ok","database":"up"}`.
   - `https://…onrender.com/login` debe mostrar el aviso "Demo con datos ficticios" y los tres usuarios.
   - Entra como **Belén**: en Inicio está el guion de demo y los reportes (`/reportes`) tienen ventas de las últimas 8 semanas.
   - Abre el enlace también desde tu celular.
7. **Verificar la base** (ver "Verificar la base de datos").

## Límites del plan gratuito (importante antes de presentar)

**Render (servicio web):**

- **El servicio se duerme** tras 15 minutos sin visitas. La primera visita después tarda alrededor de **un minuto** en responder. **Abre la URL unos minutos antes de presentar** y deja una pestaña abierta.
- **Horas del mes:** Render da 750 horas gratuitas por mes; un servicio dormido no las gasta.
- **Los archivos del servicio no se guardan** (todo está en la base de datos, así que no afecta a la demo).

**Neon (base de datos), plan Free:**

- **Sin vencimiento.** A diferencia de la base gratuita de Render (expiraba a los 30 días y se borraba a los 14 días siguientes), el proyecto de Neon no expira.
- **Cold start:** el cómputo se **suspende a los 5 minutos sin consultas** (fijo en el plan Free). La primera consulta después de una suspensión tarda unos segundos extra. El pool de la app espera hasta 20 s al conectar (`src/lib/db-config.ts`) y cierra las conexiones ociosas a los 10 s, antes de que Neon suspenda.
- **1 GB de almacenamiento por proyecto.** La demo con historial ocupa muy poco (el respaldo comprimido pesa ~180 KB). Si se supera el límite, las escrituras que aumenten el almacenamiento fallan.
- **100 horas de cómputo (CU-hrs) por proyecto al mes.** No hay cobro por exceso en el plan Free.
- **Sin SLA** y con **historial de restauración corto** (6 horas en el plan Free): no reemplaza a un respaldo. Ver "Respaldo".
- Los límites cambian con el tiempo: revisa la [página de planes de Neon](https://neon.com/pricing) antes de depender de un número.

## Tiempos: siembra y reinicio

El historial de ejemplo (unas 200 ventas y 40 pedidos, pasados por las mismas reglas del sistema) tardó entre **17 y 18 segundos** en un computador local. En Render gratis (0,1 CPU) y con la base en Neon Oregon **tardó 71,1 s** en el primer arranque (medido el 24/11/2026). Con ese tiempo el despliegue **no falló**: Render avisa `No open ports detected, continuing to scan…` mientras dura la siembra y sigue esperando.

- **Siembra inicial:** la línea `[demo:bootstrap] Datos de demo cargados en N s` de los logs.
- **Botón "Reiniciar datos de demo":** pulsa el botón una vez y mira en Logs la línea `[demo] Datos de demo reiniciados en N s.`

**Qué hacer según el tiempo:**

| Tiempo (N) | Qué significa |
|---|---|
| Hasta ~90 s | Normal en Render gratis. Hay que esperar sin hacer nada. |
| Más de ~90 s | El reinicio durante una presentación se siente largo. Solución: en el servicio → **Environment** agrega `DEMO_SEED_HISTORY` = `false`. Con eso la siembra y el reinicio cargan solo los datos base (un par de segundos) y los reportes quedan sin ventas hasta que se registren algunas. Con la variable en `false` el arranque **nunca** vuelve a sembrar una base que ya tiene datos. Para volver al historial, borra la variable y pulsa **Reiniciar datos de demo** (si solo la borras, el siguiente arranque detecta que falta el historial y recarga los datos de ejemplo, borrando lo que hayas hecho). |
| Más de varios minutos | Avisa a quien mantiene el código: habrá que reducir la cantidad de ventas del historial. |

**Riesgo de la siembra al arrancar:** la siembra inicial ocurre **antes** de que la app abra su puerto. Render no publica cuánto espera para detectar el puerto (en su documentación solo figuran los 15 minutos que espera un despliegue nuevo para quedar saludable). Si en los logs aparece `Port scan timeout reached, no open ports detected` justo después de la siembra, define `DEMO_SEED_HISTORY=false` como arriba. La siembra solo ocurre la primera vez; los reinicios y despertares posteriores arrancan en segundos.

## PIN de la demo (`DEMO_ADMIN_PIN`) y la migración de autenticación

El PIN de Belén en la demo (para "Belén está aquí", la aprobación presencial) **ya no está en el repositorio** (es público): sale de la variable `DEMO_ADMIN_PIN`. La pantalla de la demo lo sigue mostrando como pista, así que quien presenta no necesita recordarlo.

**Orden para ponerlo o cambiarlo** (la variable primero, el deploy después, y recién entonces la prueba):

1. **Elige un PIN** de 4 a 6 dígitos y no lo escribas en el repositorio, los docs ni el chat.
2. En Render → servicio `big-curvas-demo` → **Environment** → agrega `DEMO_ADMIN_PIN` con el PIN elegido.
3. **Despliega** (con "Save, rebuild, and deploy", o Manual Deploy → Deploy latest commit). Al arrancar se aplica la migración de autenticación (`prisma migrate deploy`, por la conexión directa).
4. Con el servicio **Live**, entra como Belén y pulsa **Reiniciar datos de demo** (Inicio): el seed vuelve a correr y le pone el PIN nuevo. *Sin este paso Belén conserva el PIN anterior en la base.*
5. **Prueba la aprobación remota de Belén** (guion de la demo, paso 3): la vendedora pide un descuento y Belén lo aprueba desde Aprobaciones. Si quieres probar el PIN, "Belén está aquí" y el PIN que muestra la pantalla.

Si no defines `DEMO_ADMIN_PIN`, Belén queda **sin PIN** en la demo: la aprobación remota sigue funcionando y la presencial no está disponible.

**La migración de autenticación solo agrega** (3 tablas, 4 columnas nuevas en `users`, 7 CHECK y 7 índices, y pasa los emails a minúsculas). No toca los triggers de inmutabilidad ni los CHECK existentes (verifícalo con `scripts/verify-db.sql`: 27 tablas, 32 CHECK, 45 índices y 2 triggers). **Si hubiera que volver al código anterior no hace falta revertir la migración**: el código viejo ignora las tablas y columnas nuevas y sigue funcionando con el esquema nuevo.

**La demo no cambia:** sin tocar `DEMO_MODE` (sigue en `true`) la pantalla de login es la de siempre ("Entrar como…"), el guion y el reinicio siguen igual, y "Ajustes" no aparece. El login real **no se prueba en este servicio**: se prueba en local con Docker (`DEMO_MODE=false`). Un segundo servicio de Render para probarlo compartiría las 750 horas gratuitas del workspace y podría suspender la demo; si algún día hace falta, se decide aparte.

Para un servicio con **login real** (sin `DEMO_MODE`), la orden de inicio puede ser la misma: `demo:bootstrap` no hace nada si `DEMO_MODE` no es `true`. Necesita además `AUTH_SECRET`. Ver `docs/CREDENCIALES.md`.

## Actualizar la demo después

El Blueprint deja el **despliegue automático** en **On Commit**: en principio, cada cambio que llega a la rama `feature/demo` dispara un despliegue nuevo (unos minutos). **No hay que darlo por hecho**: tras fusionar un PR a `feature/demo`, Render no siempre lo dispara.

**Después de cada fusión a `feature/demo`:**

1. Abre el servicio `big-curvas-demo` en Render → pestaña **Deploys**.
2. Comprueba que apareció un despliegue nuevo, con el commit recién fusionado.
3. Si no aparece en unos minutos, lánzalo a mano: **Manual Deploy** → **Deploy latest commit**.
4. Cuando el estado sea **Live**, revisa `/api/health`.

- Los **datos se conservan** entre despliegues: la siembra solo corre si la base está vacía.
- Las **migraciones nuevas** se aplican solas al arrancar (por la conexión directa, `DIRECT_URL`).
- Si el cambio modificó los **datos de ejemplo** (el seed), entra como Belén y pulsa **Reiniciar datos de demo** en Inicio.
- Si cambias el archivo `render.yaml` (por ejemplo, el plan), en Render: **Blueprints** → `big-curvas-demo` → **Manual Sync**. Quitar o cambiar la base de datos en el archivo **no** borra ni modifica recursos existentes: Render nunca borra recursos al sincronizar.

## Verificar la base de datos

`scripts/verify-db.sql` es de **solo lectura**: comprueba que existan las 24 tablas, los 25 CHECK, los 38 índices, los 2 triggers de inmutabilidad (`inventory_movements_immutable` y `online_order_events_immutable`, habilitados y por fila) y las 4 migraciones aplicadas. Todas las filas del resultado deben decir `OK`.

- **En Neon:** proyecto → **SQL Editor** → pega el contenido del archivo → **Run**.
- **Con `psql`:** `psql "$DIRECT_URL" -f scripts/verify-db.sql`.

Si se agrega una migración con tablas, CHECK, índices o triggers nuevos, hay que actualizar las listas del archivo (salen de `prisma/migrations`).

Prueba extra de que las reglas **rechazan** escrituras indebidas (ejecutada el 24/11/2026 contra Neon, siempre dentro de una transacción con `ROLLBACK`): `UPDATE` y `DELETE` sobre `inventory_movements` y `UPDATE` sobre `online_order_events` fallan con el código `23001` (`restrict_violation`); poner `on_hand = -1` o `reserved > on_hand` en `stock_levels` falla con `23514` (`check_violation`).

## Respaldo (RNF-06)

Neon Free guarda solo un historial corto, así que el respaldo real es un `pg_dump`. Se usa la imagen `postgres:17` de Docker (la misma versión mayor que Neon), así que **no hace falta instalar PostgreSQL en el computador** (Docker Desktop encendido). El respaldo usa la cadena **directa**: el pooler no sirve para `pg_dump`.

**Hacer el respaldo** (PowerShell, desde `big-curvas/`; `DIRECT_URL` se lee de un `.env.neon` local, que Git ignora, y se pasa a Docker por nombre para que no aparezca en la línea de comandos):

```powershell
foreach ($l in Get-Content .env.neon) { if ($l -match '^([A-Z_]+)="?(.*?)"?$') { Set-Item "Env:$($Matches[1])" $Matches[2] } }
New-Item -ItemType Directory -Force respaldo | Out-Null
docker run --rm -e DIRECT_URL -v "${PWD}\respaldo:/backup" postgres:17 sh -c 'pg_dump "$DIRECT_URL" --format=custom --no-owner --no-acl --file=/backup/big_curvas.dump'
Remove-Item Env:DIRECT_URL, Env:DATABASE_URL
```

**Probar la restauración** en el Postgres local de `docker compose` (contenedor `big-curvas-db`), en una base de prueba que se borra después:

```powershell
docker exec big-curvas-db psql -U bigcurvas -d postgres -c "CREATE DATABASE restore_check"
docker cp respaldo\big_curvas.dump big-curvas-db:/tmp/big_curvas.dump
docker exec big-curvas-db pg_restore -U bigcurvas -d restore_check --no-owner --no-acl --exit-on-error /tmp/big_curvas.dump
Get-Content scripts\verify-db.sql -Raw | docker exec -i big-curvas-db psql -U bigcurvas -d restore_check
docker exec big-curvas-db psql -U bigcurvas -d postgres -c "DROP DATABASE restore_check"
docker exec big-curvas-db rm -f /tmp/big_curvas.dump
```

- **Para restaurar de verdad** en otra base de Neon: crea el proyecto o la rama nueva, y usa `pg_restore --no-owner --no-acl -d "<cadena directa nueva>" respaldo/big_curvas.dump` (también con la imagen `postgres:17`).
- **Resultado de la prueba (24/11/2026):** el respaldo de la base de Neon con datos de la demo pesó **183 KB** (210 entradas); restaurado en una base local dio los mismos conteos (241 ventas, 41 pedidos, 696 movimientos de inventario, 3 usuarios, 1 traslado, 23 registros de auditoría, 414 filas de stock) y `scripts/verify-db.sql` dio `OK` en todo.
- Para esta prueba se usó **Postgres 17 en Docker** (`postgres:17` para `pg_dump` y el contenedor `postgres:17-alpine` de `docker-compose.yml` para restaurar). No se instaló PostgreSQL en el computador.
- **Los respaldos contienen datos:** guárdalos fuera del repositorio. En la demo son solo datos de ejemplo, pero esa misma práctica aplica a producción.
- En producción (ADR-010) el respaldo debe ser **diario y fuera del proveedor** (GitHub Action con `pg_dump`, ver `docs/03_ARQUITECTURA.md`).

## Rotar la contraseña de la base

Si una cadena de conexión se expone por error:

1. En Neon → **Roles** → menú del rol `big_curvas_owner` → **Reset password**. La contraseña anterior deja de funcionar al instante.
2. **Connect** → copia de nuevo las dos cadenas (pooled y directa), quitando `channel_binding=require` si viene.
3. En Render → servicio → **Environment** → actualiza `DATABASE_URL` y `DIRECT_URL` → **Save, rebuild, and deploy**.
4. Actualiza también tu `.env.neon` local, si lo usas para respaldos.

## Dar de baja la base vieja de Render

Si la demo venía usando la base gratuita de Render (`big-curvas-db`), **no la borres hasta confirmar que todo funciona con Neon**. Quitar el bloque `databases:` de `render.yaml` no la borra. Cuando todo esté validado: **Dashboards** → `big-curvas-db` → **Settings** → **Delete Database**. Hazlo después de haber quitado la base del archivo y sincronizado: si la borras antes de quitarla del `render.yaml`, el siguiente Manual Sync la volvería a crear. (La base vieja era PostgreSQL 18; Neon se creó con la 17 y la demo se recrea con las migraciones y el seed, sin necesidad de migrar datos.)

## Problemas frecuentes

| Síntoma | Qué revisar |
|---|---|
| El build falla con `EROFS: read-only file system, unlink '/usr/bin/pnpm'` | Es `corepack enable`, que intenta crear un enlace en `/usr/bin`, carpeta de solo lectura en Render. Los comandos del `render.yaml` ya usan `corepack pnpm …`, que ejecuta el pnpm fijado en `package.json` (`packageManager`) sin instalar enlaces. Si ves este error, revisa que el **Build Command** y el **Start Command** del servicio no tengan `corepack enable` ni `npm install -g` (el segundo tampoco sirve: también escribe en carpetas del sistema); deben ser los del `render.yaml`. |
| El build falla con `Module not found: Can't resolve '@/generated/prisma/client'` | El cliente de Prisma no se generó. Pasa cuando Render reutiliza su caché de `node_modules`: el install termina en milisegundos y no ejecuta el script `postinstall` (que es el que corre `prisma generate`). Desde el arreglo, el script `build` ejecuta `prisma generate` antes de `next build`, así que ya no depende del install y no debería repetirse. Si aparece de nuevo, en el servicio → **Manual Deploy** → **Clear build cache & deploy**, y avisa a quien mantiene el código. |
| El build falla con un error de versión de Node | Verifica que `NODE_VERSION` esté en `24` (servicio → **Environment**). |
| Pantalla "Application loading" por más de dos minutos | El servicio se está despertando; espera. Si no avanza, revisa Logs. |
| `/api/health` responde `{"status":"error","database":"down"}` | La base no responde: revisa en Neon que el proyecto esté activo (la primera consulta tras una suspensión tarda unos segundos; reintenta), que `DATABASE_URL` sea la cadena **pooled** y que la contraseña del rol no haya cambiado. |
| `prisma migrate deploy` se queda esperando o falla con un error de lock/timeout | `DIRECT_URL` falta o es la cadena **pooled**. Debe ser la **directa** (host sin `-pooler`). |
| Error de conexión por `channel_binding` | Quita `&channel_binding=require` de las dos cadenas. |
| En los logs aparece `SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'` | Es un aviso de la librería `pg`, no un error: con `sslmode=require` hoy ya verifica el certificado (el de Neon es válido). Se puede silenciar poniendo `sslmode=verify-full` en las dos cadenas. |
| La primera visita después de un rato tarda unos segundos extra | Es el cold start de Neon (autosuspend a los 5 min) sumado al del servicio de Render. No es un fallo. |
| El login dice "No hay usuarios" | La siembra no corrió o falló. Revisa Logs; reiniciar el servicio la repite. |
| Dos personas entran como usuarios distintos en el mismo navegador y se pisan | La sesión vive en una cookie del navegador. Usa otro navegador, una ventana de incógnito o el celular. |
