import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Hash de contraseñas con scrypt de Node: asíncrono (no bloquea el servidor) y sin dependencias nuevas.
// Formato: "scrypt$N$r$p$salt$hash" (salt y hash en hex). Los parámetros viajan dentro del hash, así que se pueden
// subir sin invalidar los hashes existentes (`needsRehash` avisa cuándo re-hashear en el siguiente login correcto).
//
// NO es el formato del PIN de aprobación (`scrypt$N$salt$hash`, src/modules/approvals/pin.ts), que no se toca.
//
// Costo (ADR-020): N=2^15, r=8, p=1 usa ~32 MiB. Con p=3 la instancia gratuita de Render (0,1 CPU) tardaba ~2,4 s por
// hash (medido con la CPU limitada a 0,1); con p=1 ~1,1 s. En un plan pago conviene subir p a 3 y dejar que los hashes
// se actualicen solos al próximo login.

export const SCRYPT_COST = { N: 2 ** 15, r: 8, p: 1 } as const;

const KEY_LENGTH = 64;
// Tope de los parámetros leídos desde un hash guardado: evita que un valor corrupto agote la memoria.
const MAX_N = 2 ** 17;
const MAX_R = 16;
const MAX_P = 8;

interface Cost {
  N: number;
  r: number;
  p: number;
}

function derive(secret: string, salt: Buffer, keyLength: number, cost: Cost): Promise<Buffer> {
  // `maxmem` explícito: Node rechaza la derivación si 128·N·r supera maxmem (por omisión 32 MiB, justo lo que usa
  // N=2^15, r=8). Se deja el doble de margen.
  const maxmem = 128 * cost.N * cost.r * 2;
  return new Promise((resolve, reject) => {
    scrypt(secret.normalize("NFKC"), salt, keyLength, { N: cost.N, r: cost.r, p: cost.p, maxmem }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 1 && (n & (n - 1)) === 0;
}

function parse(stored: string): { cost: Cost; salt: Buffer; hash: Buffer } | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [, n, r, p, saltHex, hashHex] = parts;
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  if (!isPowerOfTwo(cost.N) || cost.N > MAX_N) return null;
  if (!Number.isInteger(cost.r) || cost.r < 1 || cost.r > MAX_R) return null;
  if (!Number.isInteger(cost.p) || cost.p < 1 || cost.p > MAX_P) return null;
  if (!/^[0-9a-f]+$/.test(saltHex ?? "") || !/^[0-9a-f]+$/.test(hashHex ?? "")) return null;
  return { cost, salt: Buffer.from(saltHex, "hex"), hash: Buffer.from(hashHex, "hex") };
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(secret, salt, KEY_LENGTH, SCRYPT_COST);
  const { N, r, p } = SCRYPT_COST;
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Compara en tiempo constante. Un hash ilegible o con otro formato da false (nunca lanza). */
export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  const actual = await derive(secret, parsed.salt, parsed.hash.length, parsed.cost);
  return actual.length === parsed.hash.length && timingSafeEqual(actual, parsed.hash);
}

/** true si el hash guardado usa parámetros más débiles que los actuales (o no se puede leer). */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  if (!parsed) return true;
  const { N, r, p } = parsed.cost;
  return N < SCRYPT_COST.N || r < SCRYPT_COST.r || p < SCRYPT_COST.p;
}

let dummyHash: Promise<string> | null = null;

/**
 * Hace el mismo trabajo que una verificación real contra un hash falso. Se usa cuando el email no existe, para que
 * el tiempo de respuesta no delate si la cuenta existe.
 */
export async function spendVerificationTime(secret: string): Promise<void> {
  dummyHash ??= hashSecret(randomBytes(16).toString("hex"));
  await verifySecret(secret, await dummyHash);
}
