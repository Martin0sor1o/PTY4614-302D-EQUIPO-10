import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No dejar que `next dev` escriba bloques de instrucciones en CLAUDE.md / AGENTS.md (son documentos del proyecto).
  agentRules: false,
};

export default nextConfig;
