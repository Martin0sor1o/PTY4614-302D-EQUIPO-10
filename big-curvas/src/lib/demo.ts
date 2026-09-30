// DEMO: todo lo marcado como demo (login sin contraseña, reinicio de datos) depende de esta bandera.
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}
