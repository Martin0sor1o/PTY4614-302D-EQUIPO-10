import { describe, expect, it, vi } from "vitest";
import { lineKey, runIdempotent } from "./idempotency";

describe("runIdempotent", () => {
  it("ejecuta la operación si la clave no existe", async () => {
    const execute = vi.fn(async () => "nuevo");
    await expect(runIdempotent({ find: async () => null, execute })).resolves.toEqual({ result: "nuevo", replayed: false });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("devuelve el resultado guardado sin ejecutar si la clave ya existe", async () => {
    const execute = vi.fn(async () => "nuevo");
    await expect(runIdempotent({ find: async () => "guardado", execute })).resolves.toEqual({
      result: "guardado",
      replayed: true,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("si la transacción falla porque otra petición ganó la carrera, relee el resultado fuera de ella", async () => {
    const find = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce(null).mockResolvedValueOnce("del ganador");
    const execute = vi.fn(async () => {
      throw Object.assign(new Error("duplicate key"), { code: "P2002" });
    });
    await expect(runIdempotent({ find, execute })).resolves.toEqual({ result: "del ganador", replayed: true });
    expect(find).toHaveBeenCalledTimes(2);
  });

  it("propaga el error si tras fallar no hay resultado guardado", async () => {
    const error = new Error("stock insuficiente");
    await expect(runIdempotent({ find: async () => null, execute: async () => Promise.reject(error) })).rejects.toBe(error);
  });
});

describe("lineKey", () => {
  it("arma {clave}:{n}", () => {
    expect(lineKey("venta-123", 0)).toBe("venta-123:0");
    expect(lineKey("venta-123", 4)).toBe("venta-123:4");
  });
});
