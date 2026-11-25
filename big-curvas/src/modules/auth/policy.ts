// Política de autenticación (ADR-020). Los valores marcados 🟡 son defaults propuestos y confirmados; cambiarlos es
// cambiar esta constante (no hay pantalla de configuración todavía).

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Sesión web (administradora, bodega): 12 h de inactividad y 7 días absolutos. 🟡 */
export const WEB_SESSION = { idleMs: 12 * HOUR, absoluteMs: 7 * DAY } as const;

/** Sesión de caja (vendedora con PIN): 60 min de inactividad y 12 h absolutas (un turno). 🟡 */
export const POS_SESSION = { idleMs: 60 * MINUTE, absoluteMs: 12 * HOUR } as const;

/** Cookie del dispositivo POS: 180 días, revocable por una administradora. 🟡 */
export const DEVICE_COOKIE_MAX_AGE_S = 180 * 24 * 60 * 60;

/** La última actividad de una sesión se escribe como mucho una vez por minuto (evita una escritura por petición). */
export const SESSION_TOUCH_INTERVAL_S = 60;
/** Idem para `last_seen_at` de un dispositivo. */
export const DEVICE_TOUCH_INTERVAL_S = 5 * 60;

/** Login con email y contraseña: 5 fallos y 15 minutos de bloqueo, por email (exista o no la cuenta). 🟡 */
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCK_MINUTES = 15;

/** Cambio de contraseña con sesión iniciada: mismos límites, por usuario (frena adivinar la contraseña actual). */
export const PASSWORD_CHANGE_MAX_ATTEMPTS = 5;
export const PASSWORD_CHANGE_LOCK_MINUTES = 15;

/** Código de vinculación de dispositivo: 8 caracteres, 10 minutos, un solo uso, 10 intentos fallidos y 15 min de bloqueo. 🟡 */
export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_TTL_MINUTES = 10;
export const PAIRING_MAX_ATTEMPTS = 10;
export const PAIRING_LOCK_MINUTES = 15;

/** Valores por omisión del bloqueo de PIN si la tabla `settings` no los tiene (producción aún no tiene seed). */
export const PIN_MAX_ATTEMPTS_DEFAULT = 5;
export const PIN_LOCK_MINUTES_DEFAULT = 15;
export const SETTING_PIN_MAX = "pin_max_attempts";
export const SETTING_PIN_LOCK = "pin_lock_minutes";

/** PIN de vendedora: exactamente 6 dígitos. 🟡 */
export const PIN_LENGTH = 6;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

// Claves comunes (solo en minúsculas y sin símbolos). Lista corta a propósito: no reemplaza a una política de largo.
const COMMON_PASSWORDS = new Set([
  "123456789012", "1234567890123", "contrasena1234", "contrasenasegura", "password1234", "passwordpassword",
  "qwertyuiop12", "qwertyuiopas", "asdfghjkl123", "abcdefghijkl", "abc123abc123", "iloveyou1234", "bigcurvas1234",
  "bigcurvas12345", "bigcurvasbigcurvas", "administrador1", "administradora1", "contrasenatemporal", "clavetemporal1",
  "cambiame12345", "cambiamecambiame", "welcome12345", "letmein12345", "tiendarancagua", "tiendarancagua1",
  "123456123456", "111111111111", "000000000000", "aaaaaaaaaaaa", "123123123123", "654321654321", "987654321098",
]);

function squash(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Mensaje de error si la contraseña no cumple la política, o null si es válida. */
export function validatePassword(password: string, context: { email?: string | null; name?: string | null } = {}): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `La contraseña no puede superar los ${PASSWORD_MAX_LENGTH} caracteres.`;
  if (password.trim() !== password) return "La contraseña no puede empezar ni terminar con espacios.";
  const flat = squash(password);
  const local = squash((context.email ?? "").split("@")[0] ?? "");
  const name = squash(context.name ?? "");
  if (flat.length === 0 || /^(.)\1+$/.test(flat)) return "Elige una contraseña menos predecible.";
  if (COMMON_PASSWORDS.has(flat)) return "Esa contraseña es demasiado común. Elige otra.";
  if ((local.length >= 3 && flat === local) || (name.length >= 3 && flat === name) || (context.email && flat === squash(context.email))) {
    return "La contraseña no puede ser igual a tu email o a tu nombre.";
  }
  return null;
}

/** Mensaje de error si el PIN no cumple la política, o null si es válido. */
export function validatePin(pin: string): string | null {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return `El PIN debe tener exactamente ${PIN_LENGTH} dígitos.`;
  if (/^(\d)\1+$/.test(pin)) return "Elige un PIN menos predecible (no todos los dígitos iguales).";
  const digits = [...pin].map(Number);
  const step = digits[1] - digits[0];
  if ((step === 1 || step === -1) && digits.every((d, i) => i === 0 || d - digits[i - 1] === step)) {
    return "Elige un PIN menos predecible (no una secuencia).";
  }
  return null;
}

/** Normaliza un email para guardarlo y buscarlo: sin espacios y en minúsculas (CHECK users_email_lower_chk). */
export function normalizeEmail(email: string): string {
  return email.normalize("NFKC").trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
