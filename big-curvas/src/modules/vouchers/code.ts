import { randomInt } from "node:crypto";

// Código del vale (ADR-021). Es una CREDENCIAL al portador (no nominativo): quien lo tiene lo gasta. Por eso:
//  · 12 caracteres elegidos con `crypto.randomInt` (uniforme, sin sesgo de módulo) de un alfabeto de 32 símbolos sin
//    ambiguos (sin 0, O, 1, I): 32^12 = 2^60 combinaciones (~1,15·10^18). Nada secuencial ni derivado de datos del vale.
//  · La búsqueda por código está limitada por intentos (ver `resolveVoucherCode`), así que adivinar es inviable.
//  · Se muestra con guiones (VAL-XXXX-XXXX-XXXX); al escribirlo se aceptan minúsculas, espacios y guiones de más.

export const VOUCHER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 32 símbolos
export const VOUCHER_CODE_CHARS = 12;
export const VOUCHER_CODE_BITS = Math.log2(VOUCHER_ALPHABET.length) * VOUCHER_CODE_CHARS;

export function formatVoucherCode(body: string): string {
  return `VAL-${body.match(/.{4}/g)!.join("-")}`;
}

export function generateVoucherCode(): string {
  let body = "";
  for (let i = 0; i < VOUCHER_CODE_CHARS; i++) body += VOUCHER_ALPHABET[randomInt(VOUCHER_ALPHABET.length)];
  return formatVoucherCode(body);
}

/** Código escrito por una persona → forma canónica `VAL-XXXX-XXXX-XXXX`, o null si no tiene la forma de un código. */
export function normalizeVoucherCode(input: string): string | null {
  let body = input.toUpperCase().replace(/[\s_-]+/g, "");
  if (body.startsWith("VAL")) body = body.slice(3);
  if (!/^[A-Z0-9]{12}$/.test(body)) return null;
  return formatVoucherCode(body);
}
