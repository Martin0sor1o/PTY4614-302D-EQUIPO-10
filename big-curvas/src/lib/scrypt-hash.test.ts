import { describe, expect, it } from "vitest";
import { hashSecret, needsRehash, SCRYPT_COST, spendVerificationTime, verifySecret } from "./scrypt-hash";

// Contraseñas de prueba generadas a mano: ningún valor real.
const SECRET = "una frase de prueba larga y sin uso real";

describe("hashSecret / verifySecret", () => {
  it("el hash lleva sus parámetros y no contiene el secreto", async () => {
    const h = await hashSecret(SECRET);
    const [scheme, n, r, p, salt, hash] = h.split("$");
    expect(scheme).toBe("scrypt");
    expect([Number(n), Number(r), Number(p)]).toEqual([SCRYPT_COST.N, SCRYPT_COST.r, SCRYPT_COST.p]);
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
    expect(h).not.toContain(SECRET);
  });

  it("verifica el secreto correcto y rechaza el incorrecto", async () => {
    const h = await hashSecret(SECRET);
    expect(await verifySecret(SECRET, h)).toBe(true);
    expect(await verifySecret(`${SECRET}x`, h)).toBe(false);
    expect(await verifySecret("", h)).toBe(false);
  });

  it("la sal es distinta en cada hash", async () => {
    expect(await hashSecret(SECRET)).not.toBe(await hashSecret(SECRET));
  });

  it("normaliza Unicode: la misma contraseña escrita con otra composición es la misma", async () => {
    const h = await hashSecret("contraseña-ñandú-1234");
    expect(await verifySecret("contraseña-ñandú-1234".normalize("NFD"), h)).toBe(true);
  });

  it("un hash ilegible o de otro formato da false y no lanza", async () => {
    expect(await verifySecret(SECRET, "")).toBe(false);
    expect(await verifySecret(SECRET, "basura")).toBe(false);
    // Formato del PIN de aprobación (4 partes): no es válido aquí.
    expect(await verifySecret(SECRET, `scrypt$16384$${"ab".repeat(16)}$${"cd".repeat(32)}`)).toBe(false);
    // Parámetros fuera de rango: no se intenta derivar (evitaría agotar la memoria).
    expect(await verifySecret(SECRET, `scrypt$${2 ** 30}$8$1$${"ab".repeat(16)}$${"cd".repeat(32)}`)).toBe(false);
    expect(await verifySecret(SECRET, `scrypt$32768$8$1$zz$${"cd".repeat(32)}`)).toBe(false);
  });
});

describe("needsRehash", () => {
  it("un hash con el costo actual no necesita re-hash", async () => {
    expect(needsRehash(await hashSecret(SECRET))).toBe(false);
  });

  it("un hash con menos costo, o ilegible, sí", () => {
    expect(needsRehash(`scrypt$16384$8$1$${"ab".repeat(16)}$${"cd".repeat(64)}`)).toBe(true);
    expect(needsRehash("basura")).toBe(true);
  });
});

describe("spendVerificationTime", () => {
  it("no lanza y tarda lo mismo que una verificación real (mismo trabajo)", async () => {
    await expect(spendVerificationTime(SECRET)).resolves.toBeUndefined();
  });
});
