import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { createPairingCode, getCurrentUser, loginWithPassword, loginWithPin, requireAccess, requirePageAccess, resolveUser } from "@/modules/auth";
import { expectAppError, resetDemo, type Fixtures } from "./helpers";
import { ageSession, createWebUser, linkDevice, randomPassword, randomPin, SESSION_COOKIE, DEVICE_COOKIE, LOCATION_COOKIE, setPinFor, jar, sessionRow } from "./auth-helpers";

// Capa de aplicación con la sesión simulada: cookies de Next, redirecciones, Server Actions y rutas. Los servicios ya
// se prueban a fondo en los demás archivos auth-*.test.ts; aquí se comprueba que las páginas y acciones los usan bien.

const mocks = vi.hoisted(() => ({
  jar: {} as Record<string, string>,
  sets: [] as { name: string; value: string; options: Record<string, unknown> }[],
  deletes: [] as string[],
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.jar[name] ? { name, value: mocks.jar[name] } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      mocks.jar[name] = value;
      mocks.sets.push({ name, value, options });
    },
    delete: (name: string) => {
      delete mocks.jar[name];
      mocks.deletes.push(name);
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

/** Cookies que se fijaron CON valor (los borrados son sets vacíos con Max-Age=0 y se comprueban en auth-cookies.test.ts). */
const liveSets = () => mocks.sets.filter((s) => s.value !== "");

let f: Fixtures;
beforeEach(async () => {
  f = await resetDemo();
  for (const k of Object.keys(mocks.jar)) delete mocks.jar[k];
  mocks.sets.length = 0;
  mocks.deletes.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

async function asAdmin(opts: { mustChange?: boolean } = {}) {
  const u = await createWebUser({ mustChange: opts.mustChange, name: "Administradora de prueba" });
  const { session } = await loginWithPassword({ email: u.email, password: u.password });
  mocks.jar[SESSION_COOKIE] = session.token;
  return { u, token: session.token };
}
async function asSeller() {
  const { token: deviceToken } = await linkDevice(f);
  const pin = await setPinFor(f, f.actors.vendRga.id);
  const { session } = await loginWithPin({ deviceToken, userId: f.actors.vendRga.id, pin });
  mocks.jar[SESSION_COOKIE] = session.token;
  mocks.jar[DEVICE_COOKIE] = deviceToken;
  return { token: session.token, deviceToken, pin };
}
const rejects = (promise: Promise<unknown>, path: string) => expect(promise).rejects.toThrow(`REDIRECT:${path}`);

describe("rutas protegidas: páginas", () => {
  it("el layout de las pantallas autenticadas manda a /login sin sesión", async () => {
    const { default: AppLayout } = await import("@/app/(app)/layout");
    await rejects(AppLayout({ children: null }), "/login");
  });

  it("requirePageAccess: sin sesión → /login; rol equivocado → /sin-acceso; contraseña temporal → /cuenta/contrasena", async () => {
    await rejects(requirePageAccess(["ADMIN"]), "/login");
    await asSeller();
    await rejects(requirePageAccess(["ADMIN"]), "/sin-acceso");
    await expect(requirePageAccess(["VENDEDORA"])).resolves.toMatchObject({ role: "VENDEDORA" });

    for (const k of Object.keys(mocks.jar)) delete mocks.jar[k];
    await asAdmin({ mustChange: true });
    await rejects(requirePageAccess(["ADMIN"]), "/cuenta/contrasena");
  });

  it("Ajustes (dispositivos y equipo): sin sesión → /login; la vendedora → /sin-acceso; la administradora entra", async () => {
    const { default: DevicesPage } = await import("@/app/(app)/ajustes/dispositivos/page");
    const { default: TeamPage } = await import("@/app/(app)/ajustes/equipo/page");
    const { default: SettingsPage } = await import("@/app/(app)/ajustes/page");
    for (const page of [DevicesPage, TeamPage, SettingsPage]) await rejects(page(), "/login");

    await asSeller();
    for (const page of [DevicesPage, TeamPage, SettingsPage]) await rejects(page(), "/sin-acceso");

    for (const k of Object.keys(mocks.jar)) delete mocks.jar[k];
    await asAdmin();
    for (const page of [DevicesPage, TeamPage, SettingsPage]) await expect(page()).resolves.toBeDefined();
  });

  it("/cuenta/contrasena: sin sesión → /login; la caja y la demo no tienen contraseña → /; la web sí", async () => {
    const { default: ChangePasswordPage } = await import("@/app/cuenta/contrasena/page");
    await rejects(ChangePasswordPage(), "/login");
    await asSeller();
    await rejects(ChangePasswordPage(), "/");
    for (const k of Object.keys(mocks.jar)) delete mocks.jar[k];
    mocks.jar.demo_user_id = f.actors.belen.id; // sesión demo (DEMO_MODE=true en los tests)
    await rejects(ChangePasswordPage(), "/");
    for (const k of Object.keys(mocks.jar)) delete mocks.jar[k];
    await asAdmin({ mustChange: true }); // con contraseña temporal sí se puede entrar a cambiarla
    await expect(ChangePasswordPage()).resolves.toBeDefined();
  });

  it("la cookie del login demo no pisa una sesión real, y sin DEMO_MODE no identifica a nadie", async () => {
    await asAdmin();
    mocks.jar.demo_user_id = f.actors.vendRga.id;
    expect(await getCurrentUser()).toMatchObject({ role: "ADMIN", sessionKind: "WEB" });
    for (const k of Object.keys(mocks.jar)) delete mocks.jar[k];
    mocks.jar.demo_user_id = f.actors.belen.id;
    expect(await getCurrentUser()).toMatchObject({ sessionKind: "DEMO" });
    vi.stubEnv("DEMO_MODE", "");
    expect(await getCurrentUser()).toBeNull();
    const { default: AppLayout } = await import("@/app/(app)/layout");
    await rejects(AppLayout({ children: null }), "/login"); // ni siquiera con la cookie demo puesta
  });
});

describe("rutas protegidas: Server Actions", () => {
  it("sin sesión todas responden UNAUTHENTICATED (también las del POS, de las que depende el reingreso de PIN)", async () => {
    const admin = await import("@/app/(app)/ajustes/actions");
    const pos = await import("@/app/(app)/pos/actions");
    const fail = { ok: false, code: "UNAUTHENTICATED" };
    expect(await admin.createPairingAction({ locationId: f.loc.TIENDA_RANCAGUA, name: "Caja" })).toMatchObject(fail);
    expect(await admin.revokeDeviceAction({ deviceId: "x" })).toMatchObject(fail);
    expect(await admin.setSalesPinAction({ userId: f.actors.vendRga.id, pin: randomPin() })).toMatchObject(fail);
    expect(await pos.searchItemsAction("polera")).toMatchObject(fail);
    expect(await pos.refreshItemsAction([f.actors.vendRga.id])).toMatchObject(fail);
    expect(await pos.createSaleAction({})).toMatchObject(fail);
  });

  it("la vendedora no puede usar las acciones de la administradora (FORBIDDEN) y no se crea nada", async () => {
    await asSeller();
    const admin = await import("@/app/(app)/ajustes/actions");
    const forbidden = { ok: false, code: "FORBIDDEN" };
    expect(await admin.createPairingAction({ locationId: f.loc.TIENDA_RANCAGUA, name: "Intruso" })).toMatchObject(forbidden);
    expect(await admin.revokeDeviceAction({ deviceId: "x" })).toMatchObject(forbidden);
    expect(await admin.setSalesPinAction({ userId: f.actors.vendRga2.id, pin: randomPin() })).toMatchObject(forbidden);
    expect(await db.user.findUniqueOrThrow({ where: { id: f.actors.vendRga2.id } })).toMatchObject({ pinHash: null });
    expect(await db.posDevice.count()).toBe(1); // solo el de este equipo
  });

  it("la administradora genera un código, lo ve una vez y revoca el equipo", async () => {
    await asAdmin();
    const admin = await import("@/app/(app)/ajustes/actions");
    const created = await admin.createPairingAction({ locationId: f.loc.TIENDA_RANCAGUA, name: "Caja Tienda Rancagua" });
    expect(created).toMatchObject({ ok: true, deviceName: "Caja Tienda Rancagua" });
    if (!created.ok) throw new Error("no se creó");
    expect(created.code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    const device = await db.posDevice.findFirstOrThrow();
    expect(await admin.revokeDeviceAction({ deviceId: device.id })).toMatchObject({ ok: true, sessionsRevoked: 0 });
    expect(await admin.revokeDeviceAction({ deviceId: device.id })).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("con contraseña temporal TODO se rechaza salvo cambiarla", async () => {
    const { u } = await asAdmin({ mustChange: true });
    const admin = await import("@/app/(app)/ajustes/actions");
    const pos = await import("@/app/(app)/pos/actions");
    const blocked = { ok: false, code: "FORBIDDEN", message: expect.stringContaining("cambiar tu contraseña temporal") };
    expect(await admin.createPairingAction({ locationId: f.loc.TIENDA_RANCAGUA, name: "Caja" })).toMatchObject(blocked);
    expect(await pos.searchItemsAction("polera")).toMatchObject(blocked);
    await expectAppError(requireAccess({ roles: ["ADMIN"] }), "FORBIDDEN", /cambiar tu contraseña temporal/);
    await expect(requireAccess({ roles: ["ADMIN"] }, { allowPasswordChange: true })).resolves.toMatchObject({ id: u.id });

    const { changePasswordAction } = await import("@/app/cuenta/contrasena/actions");
    const next = randomPassword();
    await rejects(changePasswordAction({ current: u.password, next, confirm: next }), "/"); // éxito = redirección
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).mustChangePassword).toBe(false);
    await expect(requireAccess({ roles: ["ADMIN"] })).resolves.toMatchObject({ id: u.id }); // ya puede operar
  });

  it("changePasswordAction: la confirmación debe coincidir y el error no revela nada", async () => {
    const { u } = await asAdmin();
    const { changePasswordAction } = await import("@/app/cuenta/contrasena/actions");
    expect(await changePasswordAction({ current: u.password, next: randomPassword(), confirm: randomPassword() })).toMatchObject({ ok: false, message: expect.stringContaining("no coinciden") });
    expect(await changePasswordAction({ current: "mala", next: randomPassword(), confirm: "x" })).toMatchObject({ ok: false });
    expect(await changePasswordAction("basura")).toMatchObject({ ok: false });
  });

  it("el PIN de aprobación propio solo lo define una administradora con su contraseña", async () => {
    const { u } = await asAdmin();
    const { setApprovalPinAction } = await import("@/app/cuenta/contrasena/actions");
    expect(await setApprovalPinAction({ password: "mala", pin: randomPin() })).toMatchObject({ ok: false });
    expect(await setApprovalPinAction({ password: u.password, pin: randomPin() })).toEqual({ ok: true });
    for (const k of Object.keys(mocks.jar)) delete mocks.jar[k];
    await asSeller();
    expect(await setApprovalPinAction({ password: "x", pin: randomPin() })).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("la ubicación de operación solo la cambia la administradora, también sin DEMO_MODE", async () => {
    vi.stubEnv("DEMO_MODE", "");
    const { setActiveLocationAction } = await import("@/app/(app)/session-actions");
    const form = new FormData();
    form.set("locationId", f.loc.BODEGA);
    await expectAppError(setActiveLocationAction(form), "UNAUTHENTICATED");
    await asSeller();
    await expectAppError(setActiveLocationAction(form), "FORBIDDEN", /Solo la administradora/);
    for (const k of Object.keys(mocks.jar)) delete mocks.jar[k];
    const { token } = await asAdmin();
    await setActiveLocationAction(form);
    expect(mocks.jar[LOCATION_COOKIE]).toBe(f.loc.BODEGA);
    expect(await resolveUser(jar({ [SESSION_COOKIE]: token, [LOCATION_COOKIE]: f.loc.BODEGA }))).toMatchObject({ activeLocation: { code: "BODEGA" } });
  });
});

describe("login por las acciones y cookies", () => {
  it("email + contraseña: la cookie de sesión es httpOnly, SameSite=Lax, Path=/ y dura 7 días; el error es genérico", async () => {
    const u = await createWebUser();
    const { passwordLoginAction } = await import("@/app/login/actions");
    expect(await passwordLoginAction({ email: u.email, password: "mala" })).toEqual({ ok: false, message: "Email o contraseña incorrectos.", code: "UNAUTHENTICATED" });
    expect(mocks.sets).toHaveLength(0);

    await rejects(passwordLoginAction({ email: u.email, password: u.password }), "/");
    const created = liveSets();
    expect(created).toHaveLength(1); // una sola cookie con valor: la de sesión (el resto son borrados de cookies anteriores)
    expect(created[0]).toMatchObject({ name: "bc_session", options: { httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60 } });
    expect(await getCurrentUser()).toMatchObject({ id: u.id, sessionKind: "WEB" });
  });

  it("con contraseña temporal el login redirige a cambiarla", async () => {
    const u = await createWebUser({ mustChange: true });
    const { passwordLoginAction } = await import("@/app/login/actions");
    await rejects(passwordLoginAction({ email: u.email, password: u.password }), "/cuenta/contrasena");
  });

  it("en producción las cookies son Secure y con prefijo __Host- (sin Domain)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const u = await createWebUser();
    const { passwordLoginAction, pinLoginAction } = await import("@/app/login/actions");
    await rejects(passwordLoginAction({ email: u.email, password: u.password }), "/");
    expect(liveSets()[0]).toMatchObject({ name: "__Host-bc_session", options: { httpOnly: true, secure: true, sameSite: "lax", path: "/" } });
    expect(liveSets()[0].options).not.toHaveProperty("domain");
    expect(await getCurrentUser()).toMatchObject({ id: u.id });

    // Caja: la cookie del dispositivo también lleva __Host-.
    const { linkDeviceAction } = await import("@/app/vincular/actions");
    const created = await createPairingCode({ actor: f.actors.belen, locationId: f.loc.TIENDA_RANCAGUA, name: "Caja" });
    await rejects(linkDeviceAction({ code: created.code }), "/login?vinculado=1");
    const device = liveSets().at(-1)!;
    expect(device).toMatchObject({ name: "__Host-bc_device", options: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 180 * 24 * 60 * 60 } });
    const pin = await setPinFor(f, f.actors.vendRga.id);
    await rejects(pinLoginAction({ userId: f.actors.vendRga.id, pin }), "/pos");
    expect(liveSets().at(-1)).toMatchObject({ name: "__Host-bc_session", options: { secure: true, maxAge: 12 * 60 * 60 } });
    expect(await getCurrentUser()).toMatchObject({ id: f.actors.vendRga.id, sessionKind: "POS" });
  });

  it("vincular: un código bueno deja la cookie del dispositivo; uno malo, solo un error", async () => {
    const { linkDeviceAction } = await import("@/app/vincular/actions");
    expect(await linkDeviceAction({ code: "ZZZZZZZZ" })).toMatchObject({ ok: false, message: "Código inválido o vencido." });
    expect(await linkDeviceAction({ code: "" })).toMatchObject({ ok: false });
    expect(mocks.sets).toHaveLength(0);
    const created = await createPairingCode({ actor: f.actors.belen, locationId: f.loc.TIENDA_RANCAGUA, name: "Caja" });
    await rejects(linkDeviceAction({ code: created.code }), "/login?vinculado=1");
    expect(liveSets()[0]).toMatchObject({ name: "bc_device", options: { httpOnly: true, maxAge: 180 * 24 * 60 * 60 } });
    // El token de la cookie no es el código, y en la BD solo está su hash.
    expect(liveSets()[0].value).not.toContain(created.code.replace("-", ""));
  });

  it("PIN en el equipo vinculado: entra, y la sesión anterior del navegador se cierra (se rota el token)", async () => {
    const { token: oldToken, deviceToken, pin } = await asSeller();
    const { pinLoginAction } = await import("@/app/login/actions");
    await rejects(pinLoginAction({ userId: f.actors.vendRga.id, pin }), "/pos");
    const fresh = liveSets().at(-1)!;
    expect(fresh.name).toBe("bc_session");
    expect(fresh.value).not.toBe(oldToken);
    expect(await resolveUser(jar({ [SESSION_COOKIE]: oldToken }))).toBeNull(); // la anterior quedó revocada
    expect(mocks.jar[DEVICE_COOKIE]).toBe(deviceToken); // el equipo sigue vinculado
    expect(await pinLoginAction({ userId: f.actors.vendRga.id, pin: "x" })).toMatchObject({ ok: false, message: expect.stringContaining("PIN incorrecto") });
  });

  it("sin el equipo vinculado, el PIN no entra", async () => {
    const pin = await setPinFor(f, f.actors.vendRga.id);
    const { pinLoginAction } = await import("@/app/login/actions");
    expect(await pinLoginAction({ userId: f.actors.vendRga.id, pin })).toMatchObject({ ok: false, code: "FORBIDDEN", message: expect.stringContaining("no está vinculado") });
  });
});

describe("sesión de caja vencida: reingreso sin perder la pantalla", () => {
  it("al vencer, las acciones del POS responden UNAUTHENTICATED (el terminal lo detecta y pide el PIN) y el reingreso no redirige", async () => {
    const { token, pin } = await asSeller();
    const pos = await import("@/app/(app)/pos/actions");
    expect(await pos.searchItemsAction("polera")).toMatchObject({ ok: true });

    await ageSession(token, { idleMinutes: 61 });
    expect(await pos.searchItemsAction("polera")).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    expect(await pos.createSaleAction({})).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });

    const { listReloginOperatorsAction, pinReloginAction } = await import("@/app/login/actions");
    expect(await listReloginOperatorsAction()).toMatchObject({ ok: true, locationName: "Tienda Rancagua", operators: [{ name: "Vendedora Rancagua" }] });
    expect(await pinReloginAction({ userId: f.actors.vendRga.id, pin: "x" })).toMatchObject({ ok: false });
    expect(await pinReloginAction({ userId: f.actors.vendRga.id, pin })).toEqual({ ok: true }); // sin redirección: la pantalla y el carrito siguen
    expect(await pos.searchItemsAction("polera")).toMatchObject({ ok: true }); // y las acciones vuelven a funcionar
    expect(await getCurrentUser()).toMatchObject({ id: f.actors.vendRga.id, sessionKind: "POS" });
  });

  it("el reingreso solo existe en un equipo vinculado", async () => {
    const { listReloginOperatorsAction, pinReloginAction } = await import("@/app/login/actions");
    expect(await listReloginOperatorsAction()).toMatchObject({ ok: false });
    expect(await pinReloginAction({ userId: f.actors.vendRga.id, pin: randomPin() })).toMatchObject({ ok: false });
  });
});

describe("cerrar sesión", () => {
  it("revoca la sesión en la BD, borra las cookies de sesión y deja el dispositivo vinculado", async () => {
    const { token, deviceToken } = await asSeller();
    mocks.jar[LOCATION_COOKIE] = f.loc.BODEGA;
    const { logoutAction } = await import("@/app/(app)/session-actions");
    await rejects(logoutAction(), "/login");

    expect((await sessionRow(token)).revokedAt).not.toBeNull();
    // Las cookies se borran sobrescribiéndolas vacías con las mismas opciones y Max-Age=0 (ver auth-cookies.test.ts).
    const expired = mocks.sets.filter((s) => s.value === "" && s.options.maxAge === 0).map((s) => s.name);
    expect(expired).toEqual(expect.arrayContaining(["bc_session", "bc_location", "demo_user_id"]));
    expect(expired).not.toContain("bc_device");
    expect(mocks.jar[DEVICE_COOKIE]).toBe(deviceToken);
    expect(await getCurrentUser()).toBeNull();
    expect(await resolveUser(jar({ [SESSION_COOKIE]: token }))).toBeNull(); // el token robado tampoco sirve
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "AUTH_LOGOUT" } });
    expect(audit.userId).toBe(f.actors.vendRga.id);
  });

  it("sin sesión no falla", async () => {
    const { logoutAction } = await import("@/app/(app)/session-actions");
    await rejects(logoutAction(), "/login");
    expect(await db.auditLog.count({ where: { action: "AUTH_LOGOUT" } })).toBe(0);
  });
});

describe("acceso cruzado entre ubicaciones con sesiones reales", () => {
  it("la vendedora de Rancagua opera en Rancagua pero NO en Bodega", async () => {
    await asSeller();
    await expect(requireAccess({ roles: ["VENDEDORA"], locationId: f.loc.TIENDA_RANCAGUA })).resolves.toMatchObject({ role: "VENDEDORA" });
    await expectAppError(requireAccess({ roles: ["VENDEDORA", "BODEGA", "ADMIN"], locationId: f.loc.BODEGA }), "FORBIDDEN", /propia ubicación/);
    await expectAppError(requireAccess({ roles: ["ADMIN"] }), "FORBIDDEN", /rol/);
  });

  it("la administradora opera en cualquier ubicación", async () => {
    await asAdmin();
    for (const locationId of [f.loc.TIENDA_RANCAGUA, f.loc.BODEGA]) {
      await expect(requireAccess({ roles: ["ADMIN"], locationId })).resolves.toMatchObject({ role: "ADMIN" });
    }
  });

  it("bodega (web) opera solo en su ubicación", async () => {
    const u = await createWebUser({ role: "BODEGA", locationId: f.loc.BODEGA });
    const { session } = await loginWithPassword({ email: u.email, password: u.password });
    mocks.jar[SESSION_COOKIE] = session.token;
    await expect(requireAccess({ roles: ["BODEGA"], locationId: f.loc.BODEGA })).resolves.toBeDefined();
    await expectAppError(requireAccess({ roles: ["BODEGA"], locationId: f.loc.TIENDA_RANCAGUA }), "FORBIDDEN", /propia ubicación/);
  });
});

describe("API", () => {
  it("/api/health es público y solo dice si la app y la BD responden (sin datos de usuarios ni de configuración)", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["database", "status"]);
    expect(body).toEqual({ status: "ok", database: "up" });
  });
});
