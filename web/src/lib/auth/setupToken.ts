import { timingSafeEqual } from "node:crypto";

/**
 * Protects first-run setup on a public server (D-024). When EFFICIO_SETUP_TOKEN is set,
 * creating the first super admin requires it (via /setup?token=...), so a stranger who
 * finds a fresh deployment first can't make themselves super admin.
 * Without the variable (laptop, Codespaces) setup stays open as before.
 */
export function setupTokenRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.EFFICIO_SETUP_TOKEN);
}

export function setupTokenValid(given: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = env.EFFICIO_SETUP_TOKEN;
  if (!expected) return true;
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
