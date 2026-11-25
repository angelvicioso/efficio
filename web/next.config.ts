import type { NextConfig } from "next";
import { publicBaseUrl } from "./src/lib/publicUrl";

/**
 * Hosts trusted for form submissions (Next.js server actions reject requests whose
 * browser address doesn't match the server's, which happens behind proxies):
 *  - the configured public address (EFFICIO_BASE_URL, or detected Codespaces address)
 *  - in development only: any GitHub Codespaces address (**.github.dev). Codespaces' proxy tells the
 *    app it's "localhost:3000" while the browser is on *.app.github.dev, and its
 *    environment variables aren't always visible to the dev server.
 */
// "**" matches any number of subdomains: xyz-3000.app.github.dev, previews, github.dev itself.
const CODESPACES_HOSTS = ["**.github.dev"];
const isDev = process.env.NODE_ENV !== "production";

function trustedHosts(): string[] {
  const hosts: string[] = [];
  const base = publicBaseUrl();
  if (base) {
    try {
      hosts.push(new URL(base).host);
    } catch {
      // ignore a malformed EFFICIO_BASE_URL
    }
  }
  if (isDev) hosts.push(...CODESPACES_HOSTS);
  return hosts;
}

const allowedOrigins = trustedHosts();
if (isDev && process.env.CODESPACES) {
  // Shows up in the Codespaces terminal, to diagnose sign-in problems.
  console.log(`[efficio] trusting form submissions from: ${allowedOrigins.join(", ") || "(same address only)"}`);
}

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { allowedOrigins },
  },
  // Lets the dev server's live-reload work when opened through Codespaces.
  allowedDevOrigins: isDev ? CODESPACES_HOSTS : undefined,
};

export default nextConfig;
