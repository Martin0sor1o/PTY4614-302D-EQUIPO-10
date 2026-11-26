import { describe, expect, it } from "vitest";

// Guardia del propio perfil: si alguien vuelve a inyectar AUTH_SECRET en el perfil "demo" (o lo hereda del .env), esos
// tests dejarían de parecerse al servicio de la demo y no detectarían nada.
describe("perfiles de tests", () => {
  it('el perfil "demo" corre como Render (DEMO_MODE=true, sin AUTH_SECRET); el perfil por omisión sí lo tiene', () => {
    expect(process.env.DEMO_MODE).toBe("true");
    if (process.env.TEST_PROFILE === "demo") expect(process.env.AUTH_SECRET).toBeUndefined();
    else expect(process.env.AUTH_SECRET?.length).toBeGreaterThanOrEqual(32);
  });
});
