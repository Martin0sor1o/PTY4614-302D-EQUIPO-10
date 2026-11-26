import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeError, logUnexpectedError, redact } from "./log-error";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// Valores ficticios generados en cada corrida: no hay secretos fijos en el repositorio.
const VOUCHER = "VAL-C7KM-4QRT-9XWZ";
const PASSWORD = `Clave-${randomBytes(6).toString("hex")}`;
const TOKEN = randomBytes(32).toString("base64url");
const SESSION_HASH = randomBytes(32).toString("hex");

describe("redact", () => {
  it.each([
    ["código de vale canónico", `no existe ${VOUCHER}`, VOUCHER],
    ["código después de la palabra vale (no debe quedar ni el final)", `falló el vale ${VOUCHER}`, "9XWZ"],
    ["código con prefijo y todo pegado", "leído VALC7KM4QRT9XWZ", "9XWZ"],
    ["valor copiado por Postgres", 'invalid input syntax for type integer: "Marta Rojas"', "Marta"],
    ["código de vale en minúsculas y con espacios", "no existe val c7km 4qrt 9xwz", "c7km"],
    ["código de vale sin el prefijo", "entrada C7KM-4QRT-9XWZ rechazada", "C7KM"],
    ["código de vale pegado", "entrada C7KM4QRT9XWZ rechazada", "C7KM4QRT9XWZ"],
    ["contraseña con etiqueta", `password: "${PASSWORD}"`, PASSWORD],
    ["contraseña en JSON", `{"password":"${PASSWORD}"}`, PASSWORD],
    ["contraseña en español", `contraseña=${PASSWORD}`, PASSWORD],
    ["PIN con etiqueta", "pin: 482913", "482913"],
    ["PIN suelto", "falló al verificar 482913", "482913"],
    ["token suelto", `sesión ${TOKEN} inválida`, TOKEN],
    ["cabecera Bearer", "Authorization Bearer abc.def", "abc.def"],
    ["hash de sesión", `fila ${SESSION_HASH}`, SESSION_HASH],
    ["hash scrypt", "valor scrypt$32768$8$1$c2FsdA$aGFzaA", "c2FsdA"],
    ["cadena de conexión", `Can't connect to postgresql://usuario:${PASSWORD}@host.example/db?sslmode=require`, PASSWORD],
    ["email", "Key (email)=(clienta@ejemplo.cl) already exists.", "clienta@ejemplo.cl"],
    ["detalle de Postgres", "Key (code)=(ABC) already exists.", "ABC"],
  ])("quita: %s", (_name, input, secret) => {
    expect(redact(input)).not.toContain(secret);
  });

  it("quita el valor exacto de las variables secretas del entorno, aunque no tengan forma reconocible", () => {
    vi.stubEnv("AUTH_SECRET", "frase secreta sin forma particular");
    expect(redact("falló con frase secreta sin forma particular al final")).toBe("falló con [secreto] al final");
  });

  it("conserva lo que sirve para diagnosticar", () => {
    const message = 'new row for relation "voucher_movements" violates check constraint "voucher_movements_type_sign_chk"';
    expect(redact(message)).toBe(message);
    expect(redact('relation "returns" does not exist')).toBe('relation "returns" does not exist');
  });
});

describe("describeError / logUnexpectedError", () => {
  it("registra nombre, mensaje limpio y la pila (sin la copia del mensaje que trae `stack`)", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logUnexpectedError(new TypeError(`falló el vale ${VOUCHER} con token=${TOKEN} y password=${PASSWORD}`));
    expect(log).toHaveBeenCalledTimes(1);
    const text = String(log.mock.calls[0][0]);
    expect(text).toMatch(/^\[error inesperado\] TypeError: falló el vale \[vale\]/);
    expect(text).toMatch(/\n\s+at .*log-error\.test\.ts/);
    for (const secret of [VOUCHER, TOKEN, PASSWORD]) expect(text).not.toContain(secret);
  });

  it("de un error de Prisma descarta el cuerpo con los argumentos de la consulta", () => {
    const error = new Error(
      ["Invalid `db.voucher.findUnique()` invocation:", "", "{", `  where: { code: "${VOUCHER}", nombre: "María Pérez" },`, "}", "", "Unknown argument `nombre`."].join("\n"),
    );
    error.name = "PrismaClientKnownRequestError";
    const text = describeError(error);
    expect(text).toContain("Invalid `db.voucher.findUnique()` invocation");
    expect(text).toContain("Unknown argument `nombre`.");
    expect(text).not.toContain("María");
    expect(text).not.toContain(VOUCHER);

    error.name = "PrismaClientValidationError"; // aquí ni la última línea: puede repetir lo enviado
    expect(describeError(error)).toContain("(detalle omitido");
    expect(describeError(error)).not.toContain("Unknown argument");
  });

  it("incluye la causa y el código estable, también limpios", () => {
    const cause = Object.assign(new Error(`Key (code)=(${VOUCHER}) already exists.`), { code: "23505" });
    const text = describeError(new Error("no se pudo guardar", { cause }));
    expect(text).toContain("causado por: Error 23505:");
    expect(text).not.toContain(VOUCHER);
  });

  it("un `code` que no tiene forma de código de error no se copia", () => {
    const text = describeError(Object.assign(new Error("x"), { code: VOUCHER }));
    expect(text).not.toContain(VOUCHER);
  });

  it("si se lanza algo que no es un Error, no vuelca su contenido", () => {
    const text = describeError({ password: PASSWORD });
    expect(text).toBe("valor lanzado de tipo object");
    expect(describeError(`token=${TOKEN}`)).not.toContain(TOKEN);
  });
});
