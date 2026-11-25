/**
 * First real call to Port Houston's Navis N4 API (spike S-013).
 *
 *   npm run port-houston:check
 *
 * Reads credentials from web/.env.local (see ../.env.example) or the environment.
 * It signs in, calls the main endpoints once, and prints the SHAPE of what comes back:
 * field names, and values masked to a pattern (letters -> A/a, digits -> 9), so dates
 * and codes show their format without printing anyone's real data. The responses can
 * include other companies' records (R-017), so this script never prints real values
 * and never saves them. Safe to paste its output into the team chat or to Claude.
 */
import { EvpClient } from "../src/lib/ports/navis/evpClient";

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

const CHECKS: { resource: string; predicate?: string; why: string }[] = [
  { resource: "vessel/vesselvisits/active", why: "receiving window and cutoffs per carrier (lines[])" },
  { resource: "orders/bookings", why: "link a booking to its vessel visit; booked quantities" },
  { resource: "inventory/units", predicate: "category=EXPRT", why: "export containers: number, full/empty, where they are" },
  { resource: "road/gatetransactions", why: "empties picked up and loads dropped off at the gate" },
  { resource: "inventory/moveevents", why: "containers loaded onto vessels" },
];

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local: use the environment as-is.
  }
  const client = EvpClient.fromEnv();
  console.log("1) Signing in…");
  await client.getToken();
  console.log("   ✓ Signed in to Port Houston (token received; not printed)\n");

  for (const c of CHECKS) {
    console.log(`2) GET ${c.resource}${c.predicate ? `?predicate=${c.predicate}` : ""}   (${c.why})`);
    try {
      const rows = await client.query<unknown>(c.resource, { predicate: c.predicate, maxPages: 1 });
      console.log(`   ✓ ${rows.length} record(s) on the first page`);
      if (rows.length) console.log(describe(rows[0], "     ").join("\n"));
    } catch (e) {
      console.log(`   ✗ ${e instanceof Error ? e.message : String(e)}`);
    }
    console.log("");
  }
  console.log("Done. Send this output to Claude to map the fields (it contains no real values).");
}

if (process.argv[1]?.endsWith("port-houston-check.ts")) {
  main().catch((e) => {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
