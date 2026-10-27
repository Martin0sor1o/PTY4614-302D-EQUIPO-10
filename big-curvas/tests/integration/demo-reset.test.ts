import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDemoData, seedDemoDataIfEmpty } from "@/modules/demo";
import { GET as healthGET } from "@/app/api/health/route";
import { pingDatabase } from "@/modules/system";
import { expectAppError, resetDemo, type Fixtures } from "./helpers";

// Etapa 7: reinicio de datos de demo (solo ADMIN + DEMO_MODE), siembra inicial idempotente y health check.

// Varias pruebas cargan el historial de demo (~20 s cada una): el límite global de 30 s no alcanza.
vi.setConfig({ testTimeout: 120_000 });

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
});
afterEach(() => {
  process.env.DEMO_MODE = "true";
  delete process.env.DEMO_SEED_HISTORY;
});

describe("reiniciar datos de demo", () => {
  it("la vendedora y el rol BODEGA son rechazados y no se borra nada", async () => {
    const before = await db.user.count();
    await expectAppError(resetDemoData({ actor: f.actors.vendRga }), "FORBIDDEN");
    await expectAppError(resetDemoData({ actor: f.actors.vendRga2 }), "FORBIDDEN");
    await expectAppError(resetDemoData({ actor: f.actors.bodega }), "FORBIDDEN");
    expect(await db.user.count()).toBe(before); // el usuario de test BODEGA sigue ahí: no hubo TRUNCATE
  });

  it("sin DEMO_MODE ni siquiera Belén puede, y no se borra nada", async () => {
    process.env.DEMO_MODE = "false";
    await expectAppError(resetDemoData({ actor: f.actors.belen }), "FORBIDDEN");
    process.env.DEMO_MODE = "true";
    expect(await db.user.count({ where: { email: "bodega@bigcurvas.test" } })).toBe(1);
  });

  it("Belén con DEMO_MODE vuelve al seed con historial", async () => {
    const summary = await resetDemoData({ actor: f.actors.belen });
    expect(summary.history).toBeDefined();
    expect(summary.history!.posSales).toBeGreaterThan(0);
    expect(summary.ledgerMismatches).toBe(0);
    // El usuario creado solo para el test desapareció: es el seed completo.
    expect(await db.user.count({ where: { email: "bodega@bigcurvas.test" } })).toBe(0);
    expect(await db.sale.count()).toBeGreaterThan(0);
  });

  it("DEMO_SEED_HISTORY=false reinicia sin historial", async () => {
    process.env.DEMO_SEED_HISTORY = "false";
    const summary = await resetDemoData({ actor: f.actors.belen });
    expect(summary.history).toBeUndefined();
    expect(await db.sale.count()).toBe(0);
  });
});

describe("siembra inicial (demo:bootstrap)", () => {
  it("con la BD con datos no hace nada", async () => {
    await resetDemoData({ actor: f.actors.belen }); // con historial
    const sales = await db.sale.count();
    expect(await seedDemoDataIfEmpty()).toEqual({ seeded: false, reason: "already-seeded" });
    expect(await db.sale.count()).toBe(sales);
  });

  it("con la BD vacía siembra con historial, y la segunda vez ya no", async () => {
    await db.$executeRawUnsafe(`TRUNCATE TABLE "users" RESTART IDENTITY CASCADE`);
    expect(await db.user.count()).toBe(0);
    const first = await seedDemoDataIfEmpty();
    expect(first.seeded).toBe(true);
    expect(first.seeded && first.summary.history).toBeDefined();
    const users = await db.user.count();
    expect(await seedDemoDataIfEmpty()).toEqual({ seeded: false, reason: "already-seeded" });
    expect(await db.user.count()).toBe(users);
  });

  it("si una siembra anterior quedó sin historial (cortada a medias) la rehace", async () => {
    // resetDemo() deja el seed base sin ventas: equivale a una siembra que se cortó antes del historial.
    expect(await db.sale.count()).toBe(0);
    const result = await seedDemoDataIfEmpty();
    expect(result.seeded).toBe(true);
    expect(await db.sale.count()).toBeGreaterThan(0);
  });

  it("con DEMO_SEED_HISTORY=false una BD con datos base se considera sembrada", async () => {
    process.env.DEMO_SEED_HISTORY = "false";
    expect(await seedDemoDataIfEmpty()).toEqual({ seeded: false, reason: "already-seeded" });
  });
});

describe("/api/health", () => {
  it("responde 200 con la BD arriba", async () => {
    expect(await pingDatabase()).toBe(true);
    const res = await healthGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "up" });
  });
});
