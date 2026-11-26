import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { userMessage, AppError } from "@/lib/errors";
import { toFailure } from "@/lib/form-action";
import { resetDemo, type Fixtures } from "./helpers";

// Registro de errores inesperados, de punta a punta: el usuario ve el mensaje genérico, el servidor guarda mensaje y pila,
// y el log no contiene códigos de vale, contraseñas ni tokens. Se provocan errores REALES de Prisma y de Postgres, que
// son los que copian datos de la consulta en su mensaje.

const mocks = vi.hoisted(() => ({ jar: {} as Record<string, string> }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.jar[name] ? { name, value: mocks.jar[name] } : undefined),
    set: (name: string, value: string) => {
      mocks.jar[name] = value;
    },
    delete: (name: string) => {
      delete mocks.jar[name];
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const GENERIC = "Ocurrió un error inesperado. Intenta nuevamente.";
const VOUCHER = "VAL-C7KM-4QRT-9XWZ";
const PASSWORD = `Clave-${randomBytes(6).toString("hex")}`;
const TOKEN = randomBytes(32).toString("base64url");

let f: Fixtures;
const errorLog = vi.fn();
beforeEach(async () => {
  f = await resetDemo();
  for (const k of Object.keys(mocks.jar)) delete mocks.jar[k];
  errorLog.mockReset();
  vi.spyOn(console, "error").mockImplementation(errorLog);
});
afterEach(() => vi.restoreAllMocks());

const logged = () => errorLog.mock.calls.map((call) => call.map(String).join(" ")).join("\n");
const expectNoSecrets = () => {
  for (const secret of [VOUCHER, VOUCHER.toLowerCase(), "C7KM", PASSWORD, TOKEN]) expect(logged()).not.toContain(secret);
};
/** El error que lanza de verdad una consulta, para pasarlo por el mismo camino que usan las Server Actions. */
const thrownBy = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("la consulta debía fallar");
};

describe("errores inesperados en el log del servidor", () => {
  it("error de validación REAL de Prisma (copia la consulta completa): se registra sin sus argumentos", async () => {
    const error = await thrownBy(() => db.voucher.findUnique({ where: { code: VOUCHER, [PASSWORD]: TOKEN } as never }));
    expect(String((error as Error).message)).toContain(VOUCHER); // el mensaje original SÍ lo trae: por eso hay que limpiarlo
    expect(userMessage(error)).toBe(GENERIC);
    expect(logged()).toMatch(/\[error inesperado\] PrismaClientValidationError: /);
    expect(logged()).toMatch(/\n\s+at /); // con pila
    expectNoSecrets();
  });

  it("error REAL de Postgres con el dato en el mensaje: se registra limpio", async () => {
    const error = await thrownBy(() => db.$queryRawUnsafe("SELECT CAST($1 AS integer)", `token=${TOKEN} password=${PASSWORD} ${VOUCHER}`));
    expect(userMessage(error)).toBe(GENERIC);
    expect(logged()).toContain("[error inesperado]");
    expectNoSecrets();
  });

  it("desde una Server Action: la caja ve el mensaje genérico y el fallo queda registrado sin el código del vale", async () => {
    const { demoLogin } = await import("@/modules/auth");
    await demoLogin(f.actors.vendRga.id);
    const boom = new Error(`falló la búsqueda de ${VOUCHER} con token=${TOKEN}`);
    vi.spyOn(db.voucher, "findUnique").mockRejectedValue(boom);

    const { lookupVoucherAction } = await import("@/app/(app)/pos/devoluciones/actions");
    expect(await lookupVoucherAction(VOUCHER.toLowerCase())).toEqual({ ok: false, message: GENERIC, code: undefined });
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(logged()).toContain("[error inesperado] Error: falló la búsqueda de [vale] con token=[oculto]");
    expectNoSecrets();
  });

  it("los formularios (acceso, ajustes, vales) lo registran UNA sola vez y ya limpio", () => {
    const result = toFailure(new Error(`no se pudo desactivar ${VOUCHER} con password=${PASSWORD} para clienta@ejemplo.cl`));
    expect(result).toEqual({ ok: false, message: GENERIC, code: undefined });
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(logged()).toContain("[error inesperado] Error: no se pudo desactivar [vale] con password=[oculto] para [email]");
    expectNoSecrets();
    expect(logged()).not.toContain("clienta@ejemplo.cl");
  });

  it("un error de negocio (AppError) no se registra", () => {
    expect(userMessage(new AppError("NOT_FOUND", "No existe un vale con ese código."))).toBe("No existe un vale con ese código.");
    expect(errorLog).not.toHaveBeenCalled();
  });
});
