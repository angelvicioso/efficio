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
  const expected = env.EFFICIO_SETUP_TOKEN?.trim();
  if (!expected) return true;
  if (!given) return false;
  // Generated tokens can contain "+", which a web address turns into a space when read
  // (…?token=ab+cd arrives as "ab cd"). Put it back, and ignore stray spaces from copy-paste.
  const a = Buffer.from(given.trim().replace(/ /g, "+"));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
