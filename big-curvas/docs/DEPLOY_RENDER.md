# Publicar la demo en Render

Guía paso a paso para dejar la demo de Big Curvas en internet y abrirla desde cualquier computador o celular. Usa **planes gratuitos** de [Render](https://render.com): un servicio web y una base de datos PostgreSQL. Toda la configuración está en el archivo `render.yaml` (en la raíz del repositorio), así que no hay que crear nada a mano.

> **Aviso:** la demo publicada entra **sin contraseña** (`DEMO_MODE=true`). Cualquiera que tenga el enlace puede entrar y modificar los datos. Debe tener **solo datos de ejemplo**. El login lo avisa con "Demo con datos ficticios".

## Qué se crea

| Recurso | Nombre | Plan | Región |
|---|---|---|---|
| Servicio web (Node.js, Next.js) | `big-curvas-demo` | Free | Oregon |
| Base de datos PostgreSQL | `big-curvas-db` | Free | Oregon |

- **Rama que se publica:** `feature/demo`, carpeta `big-curvas/`.
- **Variables de entorno:** `DEMO_MODE=true`, `NODE_VERSION=24` y `DATABASE_URL` (la entrega la base de datos de Render sola). No hay secretos en el repositorio.
- **Al arrancar**, el servicio aplica las migraciones, **carga los datos de ejemplo con historial solo la primera vez** (si la base está vacía) y levanta la app.
- **Health check:** `/api/health` responde `{"status":"ok","database":"up"}`.

## Antes de empezar

1. Tener una cuenta de **GitHub** con acceso al repositorio.
2. Que la rama `feature/demo` esté subida a GitHub **con el archivo `render.yaml` en la raíz**. Si no está, avisa a quien mantiene el código para que la suba.
3. Render permite **una sola base de datos gratuita por cuenta**. Si ya tienes otra, bórrala o usa otra cuenta.

## Paso a paso

1. **Crear la cuenta.** Entra a [render.com](https://render.com), pulsa **Get Started** y elige **Sign in with GitHub**. Autoriza a Render a leer el repositorio (puedes limitarlo solo a este repositorio).
2. **Nuevo Blueprint.** En el panel de Render pulsa **New +** → **Blueprint**.
3. **Elegir el repositorio.** Conecta tu cuenta de GitHub si te lo pide y elige el repositorio del proyecto.
4. **Elegir la rama.** En la rama, escribe o selecciona **`feature/demo`** (es la que tiene `render.yaml`). Dale un nombre al Blueprint, por ejemplo `big-curvas`.
5. **Revisar y confirmar.** Render lista lo que va a crear: el servicio `big-curvas-demo` y la base `big-curvas-db`, los dos en plan **Free**. Pulsa **Apply** (o **Deploy Blueprint**).
6. **Esperar el build.** La primera vez toma varios minutos (instala dependencias, compila y arranca). Entra al servicio `big-curvas-demo` → **Logs** y busca, en este orden:
   - `All migrations have been successfully applied.`
   - `[demo:bootstrap] Datos de demo cargados en N s (con historial: …)`. **Anota ese N**: es el tiempo real de la siembra en Render (ver más abajo).
   - `✓ Ready` de Next.js. Cuando Render muestra el estado **Live**, ya está publicado.
7. **Abrir la URL.** Arriba, en el servicio, aparece el enlace `https://big-curvas-demo.onrender.com` (si el nombre ya estaba ocupado, Render le agrega letras al final). Ábrelo.
8. **Probar.**
   - `https://…onrender.com/api/health` debe mostrar `{"status":"ok","database":"up"}`.
   - `https://…onrender.com/login` debe mostrar el aviso "Demo con datos ficticios" y los tres usuarios.
   - Entra como **Belén**: en Inicio está el guion de demo y los reportes (`/reportes`) tienen ventas de las últimas 8 semanas.
   - Abre el enlace también desde tu celular.

## Límites del plan gratuito (importante antes de presentar)

- **El servicio se duerme** tras 15 minutos sin visitas. La primera visita después tarda alrededor de **un minuto** en responder. **Abre la URL unos minutos antes de presentar** y deja una pestaña abierta.
- **Horas del mes:** Render da 750 horas gratuitas por mes; un servicio dormido no las gasta.
- **La base de datos gratuita expira a los 30 días** de creada (ver "Cuando expire la base de datos").
- **Los archivos del servicio no se guardan** (todo está en la base de datos, así que no afecta a la demo).

## Tiempos: siembra y reinicio

El historial de ejemplo (unas 200 ventas y 40 pedidos, pasados por las mismas reglas del sistema) tardó entre **17 y 18 segundos** en un computador local. En el plan gratuito de Render la CPU es mucho menor (0,1 CPU), así que **puede tardar bastante más**. Hay que revisarlo en la primera publicación:

- **Siembra inicial:** la línea `[demo:bootstrap] Datos de demo cargados en N s` de los logs.
- **Botón "Reiniciar datos de demo":** pulsa el botón una vez y mira en Logs la línea `[demo] Datos de demo reiniciados en N s.`

**Qué hacer según el tiempo:**

| Tiempo (N) | Qué significa |
|---|---|
| Hasta ~30 s | Todo bien. |
| Más de ~30 s | El reinicio durante una presentación se siente largo. Solución: en el servicio → **Environment** agrega `DEMO_SEED_HISTORY` = `false`. Con eso la siembra y el reinicio cargan solo los datos base (un par de segundos) y los reportes quedan sin ventas hasta que se registren algunas. Con la variable en `false` el arranque **nunca** vuelve a sembrar una base que ya tiene datos. Para volver al historial, borra la variable y pulsa **Reiniciar datos de demo** (si solo la borras, el siguiente arranque detecta que falta el historial y recarga los datos de ejemplo, borrando lo que hayas hecho). |
| Más de varios minutos | Avisa a quien mantiene el código: habrá que reducir la cantidad de ventas del historial. |

**Riesgo de la siembra al arrancar:** la siembra inicial ocurre **antes** de que la app abra su puerto. Render no publica cuánto espera para detectar el puerto (en su documentación solo figuran los 15 minutos que espera un despliegue nuevo para quedar saludable). Con una siembra de decenas de segundos no debería haber problema. Si en los logs aparece `Port scan timeout reached, no open ports detected` justo después de la siembra, define `DEMO_SEED_HISTORY=false` como arriba. La siembra solo ocurre la primera vez; los reinicios y despertares posteriores arrancan en segundos.

## Actualizar la demo después

El Blueprint deja activado el **despliegue automático**: cada vez que se sube un cambio (**push**) a la rama `feature/demo`, Render recompila y publica solo (unos minutos). Para forzarlo a mano: servicio → **Manual Deploy** → **Deploy latest commit**.

- Los **datos se conservan** entre despliegues: la siembra solo corre si la base está vacía.
- Las **migraciones nuevas** se aplican solas al arrancar.
- Si el cambio modificó los **datos de ejemplo** (el seed), entra como Belén y pulsa **Reiniciar datos de demo** en Inicio.
- Si cambias el archivo `render.yaml` (por ejemplo, el plan), en Render: **Blueprints** → `big-curvas` → **Manual Sync**.

## Cuando expire la base de datos gratuita

Una base gratuita **expira 30 días después de crearse**. Después de expirar queda inaccesible y Render la **borra a los 14 días** si no se pasa a un plan pagado. **Anota la fecha de creación** y vuelve a crearla antes de una presentación importante. Los datos de la demo son de ejemplo, así que no se pierde nada importante.

Para recrearla:

1. En Render, entra a **Dashboards** → `big-curvas-db` → **Settings** → **Delete Database**.
2. Ve a **Blueprints** → `big-curvas` → **Manual Sync**. Render vuelve a crear `big-curvas-db` y reconecta `DATABASE_URL` sola.
3. En el servicio `big-curvas-demo` pulsa **Manual Deploy** → **Restart service** (o **Deploy latest commit**). Al arrancar, el servicio aplica las migraciones y siembra los datos de ejemplo de nuevo (con historial, salvo que hayas definido `DEMO_SEED_HISTORY=false`).
4. Revisa en Logs que aparezca `[demo:bootstrap] Datos de demo cargados…` y prueba `/api/health`.

Si la sincronización del Blueprint no recrea la base, borra el Blueprint (los recursos) y repite los pasos 2 a 8 de "Paso a paso".

## Problemas frecuentes

| Síntoma | Qué revisar |
|---|---|
| El build falla con `EROFS: read-only file system, unlink '/usr/bin/pnpm'` | Es `corepack enable`, que intenta crear un enlace en `/usr/bin`, carpeta de solo lectura en Render. Los comandos del `render.yaml` ya usan `corepack pnpm …`, que ejecuta el pnpm fijado en `package.json` (`packageManager`) sin instalar enlaces. Si ves este error, revisa que el **Build Command** y el **Start Command** del servicio no tengan `corepack enable` ni `npm install -g` (el segundo tampoco sirve: también escribe en carpetas del sistema); deben ser los del `render.yaml`. |
| El build falla con un error de versión de Node | Verifica que `NODE_VERSION` esté en `24` (servicio → **Environment**). |
| Pantalla "Application loading" por más de dos minutos | El servicio se está despertando; espera. Si no avanza, revisa Logs. |
| `/api/health` responde `{"status":"error","database":"down"}` | La base no responde: revisa que `big-curvas-db` esté **Available** y que no haya expirado. |
| El login dice "No hay usuarios" | La siembra no corrió o falló. Revisa Logs; reiniciar el servicio la repite. |
| El despliegue dice que ya existe una base gratuita | Render permite solo una por cuenta; borra la anterior o usa otra cuenta. |
| Dos personas entran como usuarios distintos en el mismo navegador y se pisan | La sesión vive en una cookie del navegador. Usa otro navegador, una ventana de incógnito o el celular. |
