/**
 * The app's public address when it isn't simply localhost:
 *  - EFFICIO_BASE_URL (hosting, or a tunnel: D-018)
 *  - Render's RENDER_EXTERNAL_URL, detected automatically
 *  - GitHub Codespaces' forwarded address, detected automatically.
 * Used for invite links and to trust form submissions through the proxy.
 */
export function publicBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.EFFICIO_BASE_URL) return env.EFFICIO_BASE_URL.replace(/\/$/, "");
  // Render sets this to the service's public address, e.g. https://efficio.onrender.com
  if (env.RENDER_EXTERNAL_URL) return env.RENDER_EXTERNAL_URL.replace(/\/$/, "");
  if (env.CODESPACE_NAME && env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    return `https://${env.CODESPACE_NAME}-${env.PORT ?? "3000"}.${env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
  }
  return null;
}
