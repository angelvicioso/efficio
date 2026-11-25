import { EvpClient } from "./evpClient";

/**
 * Port Houston connection check (spike S-013), shared by the super admin "Test connection"
 * button and `npm run port-houston:check`. Calls each main N4 endpoint once and reports field
 * names with MASKED values (letters -> A/a, digits -> 9), so formats show but no company's real
 * data does (R-017). The output is safe to share.
 */

/** "MSKU1234565" -> "AAAA9999999"; "2026-11-25T14:00:00Z" -> "9999-99-99A99:99:99A". */
export function mask(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return `"${value.replace(/[A-Z]/g, "A").replace(/[a-z]/g, "a").replace(/[0-9]/g, "9").slice(0, 40)}"`;
  if (typeof value === "number") return Number.isInteger(value) ? "<integer>" : "<number>";
  if (typeof value === "boolean") return "<true/false>";
  return typeof value;
}

/** Field names with masked example values, up to a few levels deep. */
export function describe(value: unknown, indent = "  ", depth = 0): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${indent}[] (empty list)`];
    return [`${indent}[ list of ${value.length}, first item: ]`, ...describe(value[0], indent + "  ", depth + 1)];
  }
  if (value && typeof value === "object") {
    if (depth > 3) return [`${indent}{…}`];
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      v && typeof v === "object" ? [`${indent}${k}:`, ...describe(v, indent + "  ", depth + 1)] : [`${indent}${k}: ${mask(v)}`],
    );
  }
  return [`${indent}${mask(value)}`];
}

export const CHECKS: { resource: string; predicate?: string; why: string }[] = [
  { resource: "vessel/vesselvisits/active", why: "receiving window and cutoffs per carrier (lines[])" },
  { resource: "orders/bookings", why: "link a booking to its vessel visit; booked quantities" },
  { resource: "inventory/units", predicate: "category=EXPRT", why: "export containers: number, full/empty, where they are" },
  { resource: "road/gatetransactions", why: "empties picked up and loads dropped off at the gate" },
  { resource: "inventory/moveevents", why: "containers loaded onto vessels" },
];

export function portHoustonConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.PORT_HOUSTON_EVP_CLIENT_ID && env.PORT_HOUSTON_EVP_CLIENT_SECRET);
}

/** Runs the check and returns its report as lines of text. Never throws. */
export async function runPortHoustonCheck(client?: EvpClient): Promise<string[]> {
  const out: string[] = [];
  let c: EvpClient;
  try {
    c = client ?? EvpClient.fromEnv();
  } catch (e) {
    return [`✗ ${e instanceof Error ? e.message : String(e)}`];
  }
  out.push("1) Signing in…");
  try {
    await c.getToken();
    out.push("   ✓ Signed in to Port Houston (token received; not shown)", "");
  } catch (e) {
    out.push(`   ✗ ${e instanceof Error ? e.message : String(e)}`);
    return out;
  }
  for (const check of CHECKS) {
    out.push(`2) GET ${check.resource}${check.predicate ? `?predicate=${check.predicate}` : ""}   (${check.why})`);
    try {
      const rows = await c.query<unknown>(check.resource, { predicate: check.predicate, maxPages: 1 });
      out.push(`   ✓ ${rows.length} record(s) on the first page`);
      if (rows.length) out.push(...describe(rows[0], "     "));
    } catch (e) {
      out.push(`   ✗ ${e instanceof Error ? e.message : String(e)}`);
    }
    out.push("");
  }
  out.push("Done. This report contains field names and formats only, no real values.");
  return out;
}
