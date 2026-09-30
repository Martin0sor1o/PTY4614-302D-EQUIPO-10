// API pública del módulo auth. La app solo importa desde aquí.
export { getCurrentUser, requireAccess, requirePageAccess } from "./session";
// DEMO: login sin contraseña.
export { demoLogin, demoLogout, listDemoLoginOptions, setActiveLocation, type DemoLoginOption } from "./demo-login";
