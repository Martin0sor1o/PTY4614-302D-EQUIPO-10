import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { PAIRING_CODE_LENGTH } from "./policy";

// Primitivas de autenticación con node:crypto (sin dependencias).
//
// - Tokens de sesión y de dispositivo: 32 bytes aleatorios; en la BD solo va su SHA-256 (alta entropía: no necesita scrypt).
// - Claves de throttle, huellas de auditoría y hash del código de vinculación: HMAC-SHA256 con AUTH_SECRET, para que
//   un volcado de la BD no permita probar emails ni códigos por fuerza bruta offline.

const MIN_SECRET_LENGTH = 32;

/** ¿Hay un AUTH_SECRET utilizable? La demo no lo tiene (docs/CREDENCIALES.md). */
export function hasAuthSecret(): boolean {
  return (process.env.AUTH_SECRET?.length ?? 0) >= MIN_SECRET_LENGTH;
}

/** AUTH_SECRET: variable de entorno, solo en un servicio con login real y en local (docs/CREDENCIALES.md). */
export function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !hasAuthSecret()) {
    // Error de configuración: no es un AppError, así que la UI muestra un mensaje genérico y no filtra detalles.
    throw new Error(`AUTH_SECRET no está definida o tiene menos de ${MIN_SECRET_LENGTH} caracteres (ver docs/CREDENCIALES.md).`);
  }
  return secret;
}

/** HMAC-SHA256 en hex, separado por propósito (misma entrada con otro propósito da otra clave). */
export function hmac(purpose: string, value: string): string {
  return createHmac("sha256", authSecret()).update(`${purpose}\u0000${value}`).digest("hex");
}

/** Huella corta para correlacionar eventos en la auditoría sin guardar el dato (email, etc.). */
export function fingerprint(purpose: string, value: string): string {
  return hmac(purpose, value).slice(0, 16);
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Sin 0/O ni 1/I/L para que se pueda dictar sin errores. 31 símbolos → 8 caracteres ≈ 39,6 bits.
const PAIRING_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newPairingCode(): string {
  let code = "";
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) code += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)];
  return code;
}

/** Quita espacios y guiones, pasa a mayúsculas y corrige los caracteres ambiguos (O→0 no existe en el alfabeto). */
export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function isPairingCodeShape(code: string): boolean {
  return code.length === PAIRING_CODE_LENGTH && [...code].every((c) => PAIRING_ALPHABET.includes(c));
}

/** Formato para mostrar: "ABCD-EFGH". */
export function formatPairingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
