# Credenciales y secretos

Qué variables y claves existen, dónde viven, quién las maneja, cómo se rotan y qué hacer si se filtra algo. **Este archivo no contiene ningún valor**: el repositorio es público.

## Reglas

1. **Ningún secreto en el repositorio**: ni en el código, ni en los docs, ni en commits, ni en `.env.example` (solo placeholders), ni en capturas de pantalla, ni en el chat. Los tests generan los suyos al vuelo (`vitest.config.mts`).
2. **Dónde viven los secretos:** en el panel de **Render** (variables de entorno del servicio), en el panel de **Neon** (contraseña del rol de la base) y, para desarrollo, en archivos locales que Git ignora (`.env`, `.env.neon`). Nada más.
3. **Contraseñas y PIN de personas: solo hash** (`scrypt`) en la base de datos; los tokens de sesión y de dispositivo, solo su SHA-256. Nunca van a logs, mensajes de error ni a `audit_log`.
4. Un secreto distinto por entorno (local, demo, producción): no se reutilizan.

## Inventario de variables

| Variable | Para qué sirve | ¿Secreto? | Dónde va | Quién la maneja |
|---|---|:-:|---|---|
| `DATABASE_URL` | Base de datos de la app. En Neon, la cadena **pooled** (host con `-pooler`). | **Sí** | Render → Environment · `.env` local | Quien administra Render y Neon |
| `DIRECT_URL` | Cadena **directa** de Neon: la usan `prisma migrate deploy` y los scripts. Sin ella se usa `DATABASE_URL`. | **Sí** | Render → Environment · `.env.neon` local | Quien administra Render y Neon |
| `TEST_DATABASE_URL` | Base de los tests de integración (Postgres local de Docker). **Nunca** apunta a Neon ni a Render. | No (usuario de Docker local) | `.env` local | Cada desarrolladora |
| `AUTH_SECRET` | Secreto del servidor (≥ 32 caracteres) para las huellas HMAC de intentos fallidos, de la auditoría y del código de vinculación. Se exige donde hay **login real**; la demo no lo usa. | **Sí** | Render (servicio con login real) · `.env` local | Quien administra Render |
| `DEMO_MODE` | `true` activa el login sin contraseña, el guion y el reinicio de datos. Sin ella no existen. | No | Render (solo el servicio de la demo) · `.env` local | Quien administra Render |
| `DEMO_ADMIN_PIN` | PIN (4 a 6 dígitos) de Belén en la **demo**. Solo se lee con `DEMO_MODE=true`; la pantalla lo muestra como pista. | Semisecreto (se ve en la demo pública) | Render (demo) · `.env` local | Quien monta la demo |
| `DEMO_SEED_HISTORY` | `false` = el seed no carga el historial de ventas. | No | Render · `.env` local | Quien monta la demo |
| `NODE_VERSION` | Versión de Node en Render. | No | `render.yaml` | — |

### Variables que **NO** van en Render ni en Neon

- `AUTH_INITIAL_PASSWORD` y `AUTH_INITIAL_PIN` son **solo para la terminal donde se corre el script** (`auth:create-admin`, `auth:reset-password`, `auth:create-user`). **Nunca** se definen como variable de entorno en Render ni en Neon (quedarían guardadas y visibles en el panel). Si no se pasan, el script pide la clave con un prompt oculto. Al terminar: `Remove-Item Env:AUTH_INITIAL_PASSWORD`.
- Los scripts leen `DATABASE_URL`/`DIRECT_URL` del entorno de esa terminal: para operar contra Neon se cargan desde un `.env.neon` local (ignorado por Git), nunca se pegan en un comando que quede en el historial de la terminal.

## Claves de las personas (no son variables)

| Qué | Cómo se define | Dónde queda | Rotación |
|---|---|---|---|
| Contraseña de la administradora | Script `auth:create-admin` (temporal, cambio forzado) → luego ella la cambia en `/cuenta/contrasena` | `users.password_hash` (scrypt) | Ella, cuando quiera. Si la olvida: `auth:reset-password` (por script, sin correo) |
| PIN de aprobación de la administradora | Ella, en `/cuenta/contrasena` (confirma con su contraseña) | `users.pin_hash` | Ella, cuando quiera |
| PIN de cada vendedora (6 dígitos) | La administradora, en **Ajustes → Equipo** (o `auth:create-user`) | `users.pin_hash` | La administradora lo restablece (desbloquea y cierra sus sesiones) |
| Equipo de la caja | La administradora genera un código de un solo uso en **Ajustes → Dispositivos** y se canjea en `/vincular` | `pos_devices` (solo hashes) | Se **revoca** y se vincula otro |

## Guía por plataforma

**Render (servicio `big-curvas-demo`, la demo):** `DATABASE_URL`, `DIRECT_URL`, `DEMO_MODE=true`, `DEMO_ADMIN_PIN` (opcional) y `NODE_VERSION`. **No** necesita `AUTH_SECRET` mientras solo haya demo. Las variables con valor secreto se declaran con `sync: false` en `render.yaml` y se pegan a mano en el panel.

**Render (un servicio con login real, futuro):** `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` y **sin** `DEMO_MODE`. Su orden de inicio no debe incluir `demo:bootstrap` (aunque, sin `DEMO_MODE`, no hace nada).

**Neon:** la contraseña del rol `big_curvas_owner` y las dos cadenas de conexión (pooled y directa). Se copian con el botón de copiar del panel, sin revelar el campo ni capturar la pantalla.

**Local:** `.env` (base Docker, `AUTH_SECRET` y `DEMO_ADMIN_PIN` que generas tú) y, para operar contra Neon, `.env.neon`. Ambos están en `.gitignore`: comprueba con `git check-ignore .env .env.neon`.

**GitHub:** no guarda secretos de la app. La sesión de `gh` y los tokens personales son de cada persona; activa verificación en dos pasos en las cuentas de GitHub, Render y Neon.

## Rotación

| Qué rotar | Cómo | Efecto |
|---|---|---|
| Contraseña de la base (Neon) | Neon → **Roles** → menú del rol → **Reset password** → copiar las dos cadenas nuevas → Render → **Environment** → actualizar `DATABASE_URL` y `DIRECT_URL` → **Save, rebuild, and deploy** → actualizar `.env.neon` | La anterior deja de servir al instante. Hasta el deploy, la app no conecta. |
| `AUTH_SECRET` | Generar uno nuevo (`node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`) → Render → **Environment** → deploy | Los contadores de intentos fallidos y los códigos de vinculación pendientes dejan de coincidir (se reinician solos). **Las sesiones abiertas no se cierran** (su token se guarda con SHA-256, no depende del secreto). |
| `DEMO_ADMIN_PIN` | Cambiar la variable en Render → deploy → **Reiniciar datos de demo** | El PIN de Belén en la demo cambia. Sin reiniciar los datos sigue valiendo el anterior. |
| Contraseña de la administradora | `auth:reset-password` (ver abajo) | Cierra todas sus sesiones y la obliga a elegir otra |
| PIN de una vendedora | Ajustes → Equipo → **Restablecer PIN** | Se desbloquea y se cierran sus sesiones de caja |
| Equipo de caja | Ajustes → Dispositivos → **Revocar** | Se cortan sus sesiones al instante |
| Todas las sesiones de una persona | Reiniciar su contraseña o su PIN | — |

Comandos (PowerShell, desde `big-curvas/`; con `DEMO_MODE` vacío si el `.env` local lo trae en `true`):

```powershell
$env:DEMO_MODE=''
pnpm auth:create-admin --email belen@ejemplo.cl --name "Belén"    # contraseña temporal por prompt oculto
pnpm auth:reset-password --email belen@ejemplo.cl
pnpm auth:create-user --name "Vendedora Rancagua" --location TIENDA_RANCAGUA --no-pin
pnpm auth:purge --days 30                                          # manual, sin cron
```

Los scripts se niegan a correr con `DEMO_MODE=true` (la base demo es pública y se reinicia).

## Si se filtra algo

Primero **rotar**, después investigar. Reescribir el historial de git es lo último y siempre se avisa antes (en un repositorio público un secreto ya publicado debe darse por comprometido aunque se borre el commit).

| Qué se filtró | Qué hacer |
|---|---|
| Cadena de conexión de Neon (en un chat, captura, log o commit) | Rotar la contraseña del rol (tabla de arriba) **de inmediato**. Revisar si hay actividad rara en el panel de Neon. Borrar la captura. |
| `AUTH_SECRET` | Generar uno nuevo y desplegar. Sin impacto en las sesiones; los contadores se reinician. |
| Contraseña de la administradora | `auth:reset-password`; ella elige una nueva en el primer ingreso. Revisar `audit_log` (`AUTH_LOGIN*`). |
| PIN de una vendedora o de la administradora | Restablecerlo (Ajustes → Equipo / `/cuenta/contrasena`). |
| Token de un dispositivo POS (cookie robada o equipo perdido) | **Revocar** el dispositivo en Ajustes → Dispositivos. |
| Cookie de sesión | Cerrar sesión (la revoca) o reiniciar la contraseña / el PIN. |
| Token de GitHub o de Render | Revocarlo en la plataforma y crear otro. |
| `DEMO_ADMIN_PIN` | Es un secreto débil por diseño (la pantalla de la demo lo muestra). Cambiarlo y reiniciar los datos de demo. |
| Un secreto en un commit | Rotar el secreto. Solo después, y avisando, evaluar limpiar el historial. |

## Historial del repositorio (revisión del 24/11/2026)

- Se revisaron los 116 commits de las 10 ramas remotas, buscando archivos `.env` reales, claves privadas, tokens de GitHub, claves de AWS o de pasarelas de pago, cadenas `postgres://usuario:clave@…` de Neon, Render o Supabase, contraseñas de Neon (`npg_…`) y asignaciones del tipo `SECRET=`, `TOKEN=`, `PASSWORD=`.
- **Resultado: sin secretos.** El único archivo de entorno que alguna vez estuvo versionado es `.env.example`.
- Limitaciones: se revisó solo texto (no los `.docx`, `.pdf` ni imágenes de las carpetas de las entregas del curso) y solo esos patrones.
- **Datos que sí son públicos:** los correos de autor de los commits (institucionales y el `noreply` de GitHub) y el **PIN de la demo anterior**, que estuvo en el código y los docs hasta esta iteración. Ya no está en el árbol de trabajo, pero sigue en el historial de git (no se reescribe): se debe dar por conocido y rotar `DEMO_ADMIN_PIN`.
- Un test (`tests/integration/auth-demo-mode.test.ts`) falla si ese PIN vuelve a aparecer en el repositorio.
- Repetir el escaneo antes de publicar el repositorio a terceros o de salir a producción.
