// Registro de errores INESPERADOS (todo lo que no es AppError). Al usuario se le muestra un mensaje genérico, así que sin
// esto no queda ningún rastro para diagnosticar. El log del hosting no es lugar para datos sensibles, por eso el mensaje
// se LIMPIA antes de escribirlo: nada de códigos de vale, contraseñas, PIN, tokens, hashes, emails ni cadenas de conexión.
//
// Límite conocido: un secreto escrito como texto libre, sin etiqueta ni formato reconocible, no se puede detectar. Por eso
// ningún mensaje de error propio debe incluir datos escritos por una persona.

const SECRET_ENV_VARS = ["AUTH_SECRET", "DATABASE_URL", "DIRECT_URL", "DEMO_ADMIN_PIN", "AUTH_INITIAL_PASSWORD"] as const;
const MAX_MESSAGE = 500;
const MAX_FRAMES = 20;
const MAX_CAUSES = 3;

const SENSITIVE_LABEL = "password|passwd|contraseña|contrasena|clave|pin|token|secret|code|codigo|código|hash|cookie|authorization";

const RULES: readonly [RegExp, string][] = [
  // Cadenas de conexión y cualquier URL (pueden llevar usuario, contraseña o parámetros).
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`]+/gi, "[url]"],
  [/[^\s"'`()<>,;:=]+@[^\s"'`()<>,;:=]+\.[a-z]{2,}/gi, "[email]"],
  // Código de vale: "VAL" + separador + 12 caracteres separados de cualquier forma, o todo pegado. Tras VAL se exige un
  // separador (o los 12 seguidos): si no, la regla empieza en la palabra "vale" y deja a la vista el final del código.
  [/\bVAL[\s_-]+(?:[A-Z0-9][\s_-]*){11}[A-Z0-9](?![A-Z0-9])/gi, "[vale]"],
  [/\bVAL[A-Z0-9]{12}(?![A-Z0-9])/gi, "[vale]"],
  // Valor que Postgres copia en sus mensajes: invalid input syntax for type integer: "lo escrito".
  [/(invalid input (?:syntax|value) for [^:]+:\s*)\\?"[^"]*\\?"/gi, '$1"[oculto]"'],
  [/\b[A-Z0-9]{4}[-_][A-Z0-9]{4}[-_][A-Z0-9]{4}\b/gi, "[vale]"],
  [/\b(?=[A-Z]*\d)[A-Z0-9]{12}\b/g, "[vale]"],
  [/\bscrypt\$[^\s"'`]+/gi, "[hash]"],
  [/\bBearer\s+[^\s"'`]+/gi, "Bearer [oculto]"],
  // `password: "x"`, `"token":"x"`, `pinHash=x`, `where: { code: "x" }`…
  [new RegExp(`((?:${SENSITIVE_LABEL})[A-Za-z_]*["'\`]?\\s*[:=]\\s*)("[^"]*"|'[^']*'|\`[^\`]*\`|[^\\s,;{}()\\[\\]]+)`, "gi"), "$1[oculto]"],
  // Detalle de Postgres: Key (email)=(x@y.cl) already exists.
  [/\)=\([^)]*\)/g, ")=([oculto])"],
  // Cadenas opacas largas (tokens, hashes, ids): mezclan letras y números. Los nombres de restricciones no tienen números.
  [/(?=[A-Za-z0-9_+/=-]*\d)(?=[A-Za-z0-9_+/=-]*[A-Za-z])[A-Za-z0-9_+/=-]{24,}/g, "[opaco]"],
  // Corridas de 4 o más dígitos (PIN, números de tarjeta o de documento).
  [/\b\d{4,}\b/g, "[número]"],
];

function removeEnvSecrets(text: string): string {
  let out = text;
  for (const name of SECRET_ENV_VARS) {
    const value = process.env[name];
    if (value && value.length >= 4) out = out.split(value).join("[secreto]");
  }
  return out;
}

/** Texto apto para el log: sin secretos ni datos escritos por personas. */
export function redact(text: string): string {
  return RULES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), removeEnvSecrets(text));
}

/**
 * Los errores de Prisma copian en el mensaje la consulta COMPLETA con sus argumentos (códigos, hashes, nombres). El cuerpo
 * se descarta: queda la primera línea (qué operación) y la última (por qué falló). En los de VALIDACIÓN la última línea
 * también puede repetir lo que se envió, así que solo queda la operación; la pila dice en qué línea del código fue.
 */
function relevantLines(error: Error): string[] {
  const lines = error.message.split("\n").map((l) => l.trim()).filter(Boolean);
  if (error.name === "PrismaClientValidationError") return [lines[0] ?? "", "(detalle omitido: repite los argumentos de la consulta)"];
  return error.name.startsWith("PrismaClient") && lines.length > 2 ? [lines[0], "…", lines[lines.length - 1]] : lines;
}

function safeMessage(error: Error): string {
  const text = redact(relevantLines(error).join(" "));
  return text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE)}…` : text;
}

/** Código estable del error (P2002, 23505, ECONNREFUSED…), solo si tiene forma de código: nunca texto libre. */
function safeCode(error: Error): string {
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^(P\d{4}|\d{2}[0-9A-Z]{3}|E[A-Z_]{2,30})$/.test(code) ? ` ${code}` : "";
}

/** Solo las líneas "at …" de la pila: la primera parte de `stack` repite el mensaje sin limpiar. */
function frames(error: Error): string[] {
  return (error.stack ?? "")
    .split("\n")
    .filter((line) => /^\s+at /.test(line))
    .slice(0, MAX_FRAMES)
    .map(removeEnvSecrets);
}

export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current !== undefined && current !== null && depth <= MAX_CAUSES; depth++) {
    const prefix = depth === 0 ? "" : "causado por: ";
    if (!(current instanceof Error)) {
      // Un valor lanzado que no es Error puede ser cualquier cosa (un objeto con datos): solo se anota su tipo o su texto limpio.
      parts.push(`${prefix}${typeof current === "string" ? redact(current).slice(0, MAX_MESSAGE) : `valor lanzado de tipo ${typeof current}`}`);
      break;
    }
    parts.push(`${prefix}${current.name}${safeCode(current)}: ${safeMessage(current)}`, ...frames(current));
    current = current.cause;
  }
  return parts.join("\n");
}

/** Deja el error en el log del servidor (mensaje limpio y pila). Nunca lanza: registrar no puede romper la respuesta. */
export function logUnexpectedError(error: unknown): void {
  try {
    console.error(`[error inesperado] ${describeError(error)}`);
  } catch {
    console.error("[error inesperado] no se pudo describir el error");
  }
}
