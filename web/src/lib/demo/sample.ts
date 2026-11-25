import type { DatabaseSync } from "node:sqlite";
import type { AccountService, Organization } from "@/lib/auth/accounts";
import type { BookingService } from "@/lib/bookings";

/**
 * Sample companies and simulated bookings with NO logins (D-026), safe on a hosted server.
 * Shared by the super admin "Add sample data" button and the local demo seed.
 *
 * Sample organizations are recognizable by their fixed slugs AND their ".demo" email
 * domains, so removing sample data can never touch a real customer.
 */

export const SAMPLE_ORGS = [
  { slug: "acme-exports", name: "Acme Exports", type: "exporter", domain: "acme.demo" },
  { slug: "globex-shipping", name: "Globex Shipping", type: "exporter", domain: "globex.demo" },
  { slug: "maersk-line", name: "Maersk Line", type: "ocean_carrier", domain: "maersk.demo", carrierCode: "MAEU" },
] as const;

const SAMPLE_BOOKINGS: Record<string, [string, string][]> = {
  "acme-exports": [
    ["MSCU", "HOU1001"],
    ["MAEU", "HOU1002"],
    ["HLCU", "HOU1003"],
    ["ONEY", "HOU1005"],
    ["MAEU", "HOU1006"],
    ["MSCU", "HOU1007"],
  ],
  "globex-shipping": [
    ["MAEU", "HOU1002"],
    ["CMDU", "HOU1004"],
  ],
};

export class SampleDataError extends Error {}

function isSample(org: Organization | null, domain: string): org is Organization {
  return !!org && org.domains.includes(domain);
}

export function hasSampleData(accounts: AccountService): boolean {
  return SAMPLE_ORGS.some((o) => isSample(accounts.getOrganizationBySlug(o.slug), o.domain));
}

/** Adds (or tops up) the sample companies and their bookings. Never creates accounts. */
export async function addSampleData(
  accounts: AccountService,
  bookings: BookingService,
  adapterSource: string,
): Promise<Record<string, Organization>> {
  if (adapterSource !== "mock") throw new SampleDataError("Sample data only works with simulated port data.");
  const orgs: Record<string, Organization> = {};
  for (const o of SAMPLE_ORGS) {
    const existing = accounts.getOrganizationBySlug(o.slug);
    if (existing && !isSample(existing, o.domain)) {
      throw new SampleDataError(`A real organization already uses "${o.name}", so sample data wasn't added.`);
    }
    orgs[o.slug] =
      existing ??
      accounts.createOrganization({
        name: o.name,
        type: o.type,
        domains: [o.domain],
        carrierCode: "carrierCode" in o ? o.carrierCode : null,
      });
  }
  for (const [slug, list] of Object.entries(SAMPLE_BOOKINGS)) {
    for (const [carrierCode, bookingNumber] of list) await bookings.add(orgs[slug], { carrierCode, bookingNumber });
  }
  return orgs;
}

/** Removes the sample companies (with any users invited into them) and their bookings. */
export function removeSampleData(db: DatabaseSync, accounts: AccountService, bookings: BookingService): number {
  let removed = 0;
  for (const o of SAMPLE_ORGS) {
    const org = accounts.getOrganizationBySlug(o.slug);
    if (!isSample(org, o.domain)) continue;
    db.prepare("DELETE FROM organizations WHERE id = ?").run(org.id);
    removed++;
  }
  bookings.deleteAllUnfollowed();
  return removed;
}
