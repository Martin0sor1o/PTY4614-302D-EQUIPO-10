import { describe, expect, it } from "vitest";
import { assertAccess, canAccess, type SessionLocation, type SessionUser } from "./access";
import { AppError } from "./errors";

const rga: SessionLocation = { id: "loc-rga", code: "TIENDA_RANCAGUA", name: "Tienda Rancagua", type: "STORE" };
const pro: SessionLocation = { id: "loc-pro", code: "TIENDA_PROVIDENCIA", name: "Tienda Providencia", type: "STORE" };
const bod: SessionLocation = { id: "loc-bod", code: "BODEGA", name: "Bodega", type: "WAREHOUSE" };

const admin: SessionUser = { id: "u-admin", name: "Belén", role: "ADMIN", location: null, activeLocation: rga };
const vendRga: SessionUser = { id: "u-rga", name: "Vendedora Rancagua", role: "VENDEDORA", location: rga, activeLocation: rga };
const vendPro: SessionUser = { id: "u-pro", name: "Vendedora Providencia", role: "VENDEDORA", location: pro, activeLocation: pro };
const bodega: SessionUser = { id: "u-bod", name: "Bodega", role: "BODEGA", location: bod, activeLocation: bod };

describe("assertAccess – rol", () => {
  it("permite un rol incluido", () => {
    expect(() => assertAccess(vendRga, { roles: ["VENDEDORA", "ADMIN"] })).not.toThrow();
  });
  it("rechaza un rol no incluido", () => {
    expect(() => assertAccess(bodega, { roles: ["VENDEDORA", "ADMIN"] })).toThrow(AppError);
    expect(() => assertAccess(vendRga, { roles: ["ADMIN"] })).toThrow(/rol/);
  });
});

describe("assertAccess – ubicación (acceso cruzado)", () => {
  it("la vendedora opera en su propia tienda", () => {
    expect(canAccess(vendPro, { roles: ["VENDEDORA"], locationId: pro.id })).toBe(true);
  });
  it("la vendedora de Providencia NO puede operar en Rancagua", () => {
    expect(canAccess(vendPro, { roles: ["VENDEDORA"], locationId: rga.id })).toBe(false);
    expect(() => assertAccess(vendPro, { roles: ["VENDEDORA"], locationId: rga.id })).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });
  it("la vendedora de Rancagua NO puede operar en Bodega", () => {
    expect(canAccess(vendRga, { roles: ["VENDEDORA", "BODEGA"], locationId: bod.id })).toBe(false);
  });
  it("Bodega opera solo en bodega", () => {
    expect(canAccess(bodega, { roles: ["BODEGA"], locationId: bod.id })).toBe(true);
    expect(canAccess(bodega, { roles: ["BODEGA"], locationId: pro.id })).toBe(false);
  });
  it("ADMIN opera en cualquier ubicación", () => {
    for (const loc of [rga, pro, bod]) {
      expect(canAccess(admin, { roles: ["ADMIN"], locationId: loc.id })).toBe(true);
    }
  });
  it("sin locationId solo se valida el rol (lectura)", () => {
    expect(canAccess(vendPro, { roles: ["VENDEDORA"] })).toBe(true);
  });
});
