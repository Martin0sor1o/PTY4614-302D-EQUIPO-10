import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDemo, type Fixtures } from "./helpers";

// La página /reportes se prueba llamando al componente de servidor con la sesión simulada (cookie de la demo):
// la guardia de la página es la primera línea de defensa; el módulo reports vuelve a validar el rol en cada consulta.

const cookieJar: Record<string, string> = {};
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (cookieJar[name] ? { name, value: cookieJar[name] } : undefined) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
  for (const k of Object.keys(cookieJar)) delete cookieJar[k];
});

async function openPage(search: Record<string, string> = {}) {
  const { default: ReportsPage } = await import("@/app/(app)/reportes/page");
  return ReportsPage({ searchParams: Promise.resolve(search), params: Promise.resolve({}) } as never);
}

describe("página /reportes", () => {
  it("sin sesión → /login", async () => {
    await expect(openPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("la vendedora de Rancagua es rechazada (→ /sin-acceso) en cada pestaña, con o sin filtros", async () => {
    cookieJar.demo_user_id = f.actors.vendRga.id;
    for (const tab of ["ventas", "mas-vendidos", "stock-bajo", "sin-rotacion", "viernes"]) {
      await expect(openPage({ tab })).rejects.toThrow("REDIRECT:/sin-acceso");
    }
    await expect(openPage({ tab: "ventas", desde: "2026-01-01", hasta: "2026-12-31", canal: "online" })).rejects.toThrow("REDIRECT:/sin-acceso");
  });

  it("el rol BODEGA tampoco entra", async () => {
    cookieJar.demo_user_id = f.actors.bodega.id;
    await expect(openPage()).rejects.toThrow("REDIRECT:/sin-acceso");
  });

  it("Belén sí entra en cada pestaña", async () => {
    cookieJar.demo_user_id = f.actors.belen.id;
    for (const tab of ["ventas", "mas-vendidos", "stock-bajo", "sin-rotacion", "viernes"]) {
      await expect(openPage({ tab })).resolves.toBeDefined();
    }
  });
});
