// API pública del módulo auth. La app solo importa desde aquí. Diseño y política: docs/ADR-020 (07_DECISIONES_Y_PREGUNTAS.md).
//
// - Administradora (y bodega): email + contraseña (scrypt), sesión en la BD, bloqueo por intentos.
// - Caja: dispositivo POS vinculado a una tienda por una administradora + PIN de 6 dígitos por vendedora.
// - Demo: "Entrar como…" sin contraseña, solo con DEMO_MODE=true.
export { getCurrentUser, requireAccess, requirePageAccess, requireSessionPage, resolveUser, logout, setActiveLocation, type RequireAccessOptions } from "./session";
export {
  signInWithPassword,
  signInWithPin,
  linkThisDevice,
  getDeviceLogin,
  changeOwnPassword,
} from "./flows";
export { createPairingCode, revokeDevice, listDevices, type DeviceRow, type DeviceStatus, type PairingCreated } from "./pos-devices";
// Servicios SIN cookies (los envuelven los flujos de arriba y los tests de integración).
export { redeemPairingCode, resolveDevice, type LinkedDevice, type ResolvedDevice } from "./pos-devices";
export { loginWithPassword, changePassword, type WebLoginResult } from "./web-login";
export { loginWithPin, listOperators, type PosLoginResult } from "./pos-login";
export { createSession, resolveSession, revokeSessionByToken, revokeUserSessions, type CreatedSession, type ResolvedSession, type SessionKind } from "./sessions";
export { listSalesTeam, setSalesPin, setOwnApprovalPin, hasApprovalPin, type TeamMember, type OperatorOption } from "./pos-login";
export { createAdminAccount, resetPasswordAccount, createSalesAccount } from "./accounts";
export { purgeAuthData, type PurgeResult } from "./purge";
export { PIN_LENGTH, PASSWORD_MIN_LENGTH, validatePassword, validatePin } from "./policy";
export type { CookieReader } from "./cookies";
// DEMO: login sin contraseña.
export { demoLogin, listDemoLoginOptions, type DemoLoginOption } from "./demo-login";
