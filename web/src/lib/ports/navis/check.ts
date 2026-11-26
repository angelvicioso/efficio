import { describeCredentials, EvpClient } from "./evpClient";

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
  // Digit count is safe and tells dates apart: 13 digits = epoch milliseconds, 10 = seconds.
  if (typeof value === "number") return Number.isInteger(value) ? `<integer, ${String(Math.abs(value)).length} digits>` : "<number>";
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
  if (!client) out.push(...describeCredentials());
  try {
    await c.getToken();
    out.push("   ✓ Signed in to Port Houston (token received; not shown)", "");
  } catch (e) {
    out.push(`   ✗ ${e instanceof Error ? e.message : String(e)}`);
    if (e instanceof Error && /\(401\)|\(400\)/.test(e.message)) {
      out.push(
        "",
        "   The login server rejected the client ID or secret. Check the secret character by character",
        "   (l / I / 1 and O / 0 look alike), then ask the Port Houston contact whether the credentials",
        "   are still active.",
      );
    }
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

/**
 * Runs the live lookup for one booking (admin "Test a booking"), and reports each step plus
 * what Efficio would show. Real values for this one booking only; never other companies' data.
 */
export async function runBookingCheck(carrierCode: string, bookingNumber: string, client?: EvpClient): Promise<string[]> {
  const { NavisPortHoustonAdapter } = await import("./adapter");
  const { containerProgress } = await import("@/lib/domain/containers");
  const { sizeTypeLabel } = await import("@/lib/domain/types");
  const { formatHouston } = await import("@/lib/format");
  const t = (iso: string | null | undefined) => (iso ? formatHouston(iso) : "—");
  const out: string[] = [`Booking ${bookingNumber.trim().toUpperCase()} · carrier ${carrierCode.trim().toUpperCase()}`, ""];
  let adapter;
  try {
    adapter = new NavisPortHoustonAdapter(client ?? EvpClient.fromEnv());
  } catch (e) {
    return [...out, `✗ ${e instanceof Error ? e.message : String(e)}`];
  }
  try {
    const s = await adapter.lookupBooking({ carrierCode, bookingNumber }, (l) => out.push(`  · ${l}`));
    out.push("", "What Efficio would show:");
    if (!s.onFile) {
      out.push("  Not on file at the terminal (for this carrier).");
      return out;
    }
    const p = containerProgress(s);
    out.push(
      `  Terminal: ${s.terminal ?? "—"}`,
      `  Vessel: ${s.vesselVisit ? `${s.vesselVisit.vesselName} / ${s.vesselVisit.voyage ?? "—"} (visit ${s.vesselVisit.id})` : "—"}`,
      `  Departs: ${t(s.vesselVisit?.etd)}`,
      `  Receiving opens: ${t(s.receivingOpensAt)}`,
      `  Cargo cutoff: ${t(s.cutoffs.find((c) => c.kind === "cargo")?.at)}`,
      `  Other cutoffs: ${s.cutoffs.filter((c) => c.kind !== "cargo").map((c) => `${c.kind} ${t(c.at)}`).join(", ") || "—"}`,
      `  Booked: ${(s.equipment ?? []).map((e) => `${e.quantity} × ${sizeTypeLabel(e.sizeType)} (${e.sizeType})`).join(", ") || "—"}`,
      `  Containers: ${p.booked} booked · ${p.pickedUp} picked up · ${p.atTerminal} at terminal · ${p.loaded} on vessel`,
      ...(s.containers ?? []).map(
        (c) => `    ${c.number}  ${sizeTypeLabel(c.sizeType) || "?"}  ${c.stage}  out ${t(c.emptyPickedUpAt)}  in ${t(c.fullGateInAt)}  loaded ${t(c.loadedAt)}`,
      ),
      "",
      "Times are Houston time. Compare these with what Orlando sees in Lynx for the same booking.",
    );
  } catch (e) {
    out.push(`✗ ${e instanceof Error ? e.message : String(e)}`);
  }
  return out;
}
