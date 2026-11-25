import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { verifyPin } from "@/modules/approvals";
import { demoAccessEnabled, demoLogin, listDemoLoginOptions, resolveUser } from "@/modules/auth";
import { demoPinHint, resetAndSeedDemoData, resetDemoData, seedDemoDataIfEmpty } from "@/modules/demo";
import { expectAppError, resetDemo, type Fixtures } from "./helpers";
import { createWebUser, jar, SESSION_COOKIE } from "./auth-helpers";
import { loginWithPassword } from "@/modules/auth";

// El modo demo existe SOLO con DEMO_MODE=true. vitest.config.mts lo pone en "true"; aquí se apaga con stubEnv.

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});
afterEach(() => vi.unstubAllEnvs());

describe("sin DEMO_MODE no existen el login demo ni los PIN demo", () => {
  it("no lista usuarios ni deja entrar", async () => {
    expect((await listDemoLoginOptions()).length).toBeGreaterThan(0); // con la demo activa sí
    vi.stubEnv("DEMO_MODE", "");
    expect(await listDemoLoginOptions()).toEqual([]);
    await expectAppError(demoLogin(f.actors.belen.id), "FORBIDDEN", /deshabilitado/);
  });

  it("la cookie del login demo se ignora aunque tenga un id de usuario válido", async () => {
    expect(await resolveUser(jar({ demo_user_id: f.actors.belen.id }))).toMatchObject({ id: f.actors.belen.id, sessionKind: "DEMO" });
    vi.stubEnv("DEMO_MODE", "");
    expect(await resolveUser(jar({ demo_user_id: f.actors.belen.id }))).toBeNull();
    vi.stubEnv("DEMO_MODE", "false");
    expect(await resolveUser(jar({ demo_user_id: f.actors.belen.id }))).toBeNull();
    vi.stubEnv("DEMO_MODE", "TRUE"); // solo el valor exacto "true" activa la demo
    expect(await resolveUser(jar({ demo_user_id: f.actors.belen.id }))).toBeNull();
  });

  it("la pista del PIN demo desaparece aunque DEMO_ADMIN_PIN esté definida", async () => {
    expect(demoPinHint()).toBe(process.env.DEMO_ADMIN_PIN);
    vi.stubEnv("DEMO_MODE", "");
    expect(process.env.DEMO_ADMIN_PIN).toBeTruthy();
    expect(demoPinHint()).toBeNull();
  });

  it("no se siembra ni se reinicia: el seed y el reinicio se niegan, y el bootstrap no hace nada ni falla", async () => {
    vi.stubEnv("DEMO_MODE", "");
    const users = await db.user.count();
    await expectAppError(resetAndSeedDemoData(), "FORBIDDEN", /DEMO_MODE/);
    await expectAppError(resetDemoData({ actor: f.actors.belen }), "FORBIDDEN", /modo demostración/);
    expect(await seedDemoDataIfEmpty()).toEqual({ seeded: false, reason: "not-demo" });
    expect(await db.user.count()).toBe(users);
  });

  it("el bootstrap no siembra datos de ejemplo sobre una base vacía de un servicio real", async () => {
    vi.stubEnv("DEMO_MODE", "");
    await db.$executeRawUnsafe(`TRUNCATE TABLE "users", "locations" RESTART IDENTITY CASCADE`);
    expect(await seedDemoDataIfEmpty()).toEqual({ seeded: false, reason: "not-demo" });
    expect(await db.user.count()).toBe(0);
  });

  it("el login real sigue funcionando sin DEMO_MODE", async () => {
    vi.stubEnv("DEMO_MODE", "");
    const u = await createWebUser();
    const { session } = await loginWithPassword({ email: u.email, password: u.password });
    expect(await resolveUser(jar({ [SESSION_COOKIE]: session.token }))).toMatchObject({ id: u.id, sessionKind: "WEB" });
  });
});

describe("con DEMO_MODE=true la demo sigue igual", () => {
  it("lista los usuarios de ejemplo y la cookie demo identifica al usuario", async () => {
    const options = await listDemoLoginOptions();
    expect(options.map((o) => o.name)).toEqual(expect.arrayContaining(["Belén", "Vendedora Rancagua", "Vendedora 2 Rancagua"]));
    expect(await resolveUser(jar({ demo_user_id: f.actors.vendRga.id }))).toMatchObject({
      id: f.actors.vendRga.id,
      role: "VENDEDORA",
      sessionKind: "DEMO",
      location: { code: "TIENDA_RANCAGUA" },
    });
    expect(await resolveUser(jar({ demo_user_id: "no-existe" }))).toBeNull();
  });
});

describe("la demo nunca crea contraseñas (así la guardia de cuentas reales no la afecta)", () => {
  const withHash = () => db.user.count({ where: { passwordHash: { not: null } } });

  it("el seed demo no deja ningún password_hash", async () => {
    await resetAndSeedDemoData({ history: true });
    expect(await db.user.count()).toBeGreaterThan(0);
    expect(await withHash()).toBe(0);
  });

  it('"Reiniciar datos de demo" tampoco crea ninguno', async () => {
    await resetDemoData({ actor: f.actors.belen });
    expect(await db.user.count()).toBeGreaterThan(0);
    expect(await withHash()).toBe(0);
    expect(await listDemoLoginOptions()).not.toHaveLength(0); // la demo sigue entrando como siempre
  });
});

describe("DEMO_MODE=true con cuentas reales en la base: el acceso demo se deshabilita (el servicio sigue)", () => {
  const BLOCKED = /Acceso demo deshabilitado: la base tiene cuentas reales/;
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it("listDemoLoginOptions y demoLogin se niegan con un mensaje claro y queda una advertencia en el log", async () => {
    const real = await createWebUser();
    await expectAppError(listDemoLoginOptions(), "FORBIDDEN", BLOCKED);
    await expectAppError(demoLogin(f.actors.belen.id), "FORBIDDEN", BLOCKED);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain("DEMO_MODE=true");
    expect(String(warn.mock.calls[0][0])).not.toContain(real.email); // la advertencia no filtra datos
  });

  it("la cookie demo no identifica a nadie (era solo un id de usuario, cualquiera podría falsificarla)", async () => {
    const real = await createWebUser();
    expect(await resolveUser(jar({ demo_user_id: real.id }))).toBeNull();
    expect(await resolveUser(jar({ demo_user_id: f.actors.belen.id }))).toBeNull();
  });

  it("el login real sigue funcionando con DEMO_MODE=true", async () => {
    const real = await createWebUser();
    const { session } = await loginWithPassword({ email: real.email, password: real.password });
    expect(await resolveUser(jar({ [SESSION_COOKIE]: session.token }))).toMatchObject({ id: real.id, sessionKind: "WEB" });
  });

  it("el reinicio y la siembra no tocan nada (no vacían las cuentas reales) y no fallan el arranque", async () => {
    await createWebUser();
    const users = await db.user.count();
    await expectAppError(resetDemoData({ actor: f.actors.belen }), "FORBIDDEN", /cuentas reales/);
    expect(await seedDemoDataIfEmpty()).toEqual({ seeded: false, reason: "real-accounts" });
    expect(await db.user.count()).toBe(users);
  });

  it("el chequeo se cachea: no consulta en cada petición y se refresca al vencer", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      expect(await demoAccessEnabled()).toBe(true); // sin cuentas reales; queda en caché
      await createWebUser();
      expect(await demoAccessEnabled()).toBe(true); // dentro de la ventana: todavía no se entera
      vi.setSystemTime(Date.now() + 4 * 60_000);
      expect(await demoAccessEnabled()).toBe(false); // pasada la ventana: se refresca y se deshabilita
      expect(warn).toHaveBeenCalledTimes(1);
      expect(await demoAccessEnabled()).toBe(false); // y vuelve a cachearse (no repite la advertencia)
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sin DEMO_MODE la guardia no consulta nada ni advierte", async () => {
    await createWebUser();
    vi.stubEnv("DEMO_MODE", "");
    expect(await demoAccessEnabled()).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("DEMO_ADMIN_PIN: el PIN de la demo sale del entorno, no del repositorio", () => {
  it("con la variable, Belén recibe ese PIN (hasheado) y la pista lo muestra solo en modo demo", async () => {
    const pin = process.env.DEMO_ADMIN_PIN!;
    const belen = await db.user.findUniqueOrThrow({ where: { id: f.actors.belen.id } });
    expect(verifyPin(pin, belen.pinHash!)).toBe(true);
    expect(belen.pinHash).not.toContain(pin);
    expect(demoPinHint()).toBe(pin);
  });

  it("sin la variable (o inválida), Belén queda SIN PIN y no hay pista", async () => {
    for (const value of ["", "abc", "12", "1234567", "12 34"]) {
      vi.stubEnv("DEMO_ADMIN_PIN", value);
      await resetAndSeedDemoData();
      const belen = await db.user.findFirstOrThrow({ where: { email: "belen@bigcurvas.demo" } });
      expect(belen.pinHash, `valor "${value}"`).toBeNull();
      expect(demoPinHint()).toBeNull();
    }
  });

  it("ningún archivo del repositorio contiene el PIN demo que antes estaba publicado", () => {
    const old = new RegExp(`\\b${"24"}${"68"}\\b`);
    const roots = ["src", "docs", "tests", "scripts", "prisma", "README.md", ".env.example", "CLAUDE.md"];
    const hits: string[] = [];
    const walk = (path: string) => {
      const stat = statSync(path, { throwIfNoEntry: false });
      if (!stat) return;
      if (stat.isDirectory()) {
        if (["generated", "node_modules", ".next"].includes(path.split(/[\\/]/).pop()!)) return;
        for (const name of readdirSync(path)) walk(join(path, name));
      } else if (/\.(ts|tsx|md|mts|sql|json|yaml|yml|prisma|env|example|txt|css)$/.test(path) || path.endsWith(".env.example")) {
        if (old.test(readFileSync(path, "utf8"))) hits.push(path);
      }
    };
    roots.forEach(walk);
    expect(hits).toEqual([]);
  });
});
