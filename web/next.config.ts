import type { NextConfig } from "next";

/**
 * When the app is reached through a tunnel or proxy (e.g. a temporary share link),
 * set EFFICIO_BASE_URL to that public address. Its host is then trusted for form
 * submissions (Next.js server actions block requests from other addresses by default).
 */
function trustedHosts(): string[] {
  const base = process.env.EFFICIO_BASE_URL;
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
