import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No dejar que `next dev` escriba bloques de instrucciones en CLAUDE.md / AGENTS.md (son documentos del proyecto).
  agentRules: false,
  // Solo `next dev`: permite abrir la app también por 127.0.0.1 (otro origen = otra cookie de sesión). Sirve para simular
  // dos ventanas a la vez (la vendedora en la caja y Belén en /aprobaciones). No afecta a `next start` ni a producción.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
