import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSafeAuditData } from "./audit";
import {
  authSecret,
  fingerprint,
  formatPairingCode,
  hashToken,
  hmac,
  isPairingCodeShape,
  newPairingCode,
  newToken,
  normalizePairingCode,
} from "./crypto";

// AUTH_SECRET lo pone vitest.config.mts (aleatorio por corrida). Estos tests cambian el entorno y lo restauran.
afterEach(() => vi.unstubAllEnvs());

describe("AUTH_SECRET", () => {
  it("sin secreto, o con uno corto, falla con un mensaje que no revela valores", () => {
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => authSecret()).toThrow(/AUTH_SECRET/);
    vi.stubEnv("AUTH_SECRET", "corto");
    expect(() => hmac("x", "y")).toThrow(/menos de 32/);
  });
});

describe("hmac / fingerprint", () => {
  it("es determinista, depende del propósito y del secreto, y no contiene la entrada", () => {
    const a = hmac("email", "belen@ejemplo.cl");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hmac("email", "belen@ejemplo.cl")).toBe(a);
    expect(hmac("login", "belen@ejemplo.cl")).not.toBe(a);
    expect(hmac("email", "otra@ejemplo.cl")).not.toBe(a);
    expect(a).not.toContain("belen");
    vi.stubEnv("AUTH_SECRET", "z".repeat(40));
    expect(hmac("email", "belen@ejemplo.cl")).not.toBe(a);
  });

  it("la huella son los primeros 16 hex del HMAC", () => {
    expect(fingerprint("email", "x@y.cl")).toBe(hmac("email", "x@y.cl").slice(0, 16));
  });
});

describe("tokens", () => {
  it("32 bytes aleatorios en base64url y distintos cada vez", () => {
    const t = newToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(t);
  });

  it("el hash del token es SHA-256 en hex y no contiene el token", () => {
    const t = newToken();
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken(t)).toBe(hashToken(t));
  });
});

describe("código de vinculación", () => {
  it("8 caracteres sin los ambiguos (0, O, 1, I, L)", () => {
    for (let i = 0; i < 200; i++) {
      const c = newPairingCode();
      expect(c).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
      expect(isPairingCodeShape(c)).toBe(true);
    }
  });

  it("se normaliza lo que escribe la persona y se muestra en dos mitades", () => {
    expect(normalizePairingCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(formatPairingCode("ABCDEFGH")).toBe("ABCD-EFGH");
    expect(isPairingCodeShape("ABCD0EFG")).toBe(false); // el 0 no existe en el alfabeto
    expect(isPairingCodeShape("ABC")).toBe(false);
  });
});

describe("auditoría: datos prohibidos", () => {
  it("rechaza claves que suenan a secreto", () => {
    for (const key of ["password", "newPassword", "pin", "token", "secret", "passwordHash", "pairingCode", "cookie", "clave"]) {
      expect(() => assertSafeAuditData({ [key]: "x" }), key).toThrow(/no permitido/);
    }
  });

  it("permite los datos operativos que se usan", () => {
    expect(() => assertSafeAuditData({ method: "PIN", deviceId: "d1", attempts: 2, emailFp: "abc", lockedUntil: null, mustChange: false })).not.toThrow();
    expect(() => assertSafeAuditData(undefined)).not.toThrow();
  });
});
