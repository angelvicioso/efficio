import type { NextConfig } from "next";
import { publicBaseUrl } from "./src/lib/publicUrl";

/**
 * When the app is reached through a tunnel, proxy or GitHub Codespaces, its public host
 * is trusted for form submissions (Next.js server actions block other addresses by default).
 */
function trustedHosts(): string[] {
  const base = publicBaseUrl();
  if (!base) return [];
  try {
    return [new URL(base).host];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { allowedOrigins: trustedHosts() },
  },
};

export default nextConfig;
