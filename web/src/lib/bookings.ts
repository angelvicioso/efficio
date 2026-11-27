import type { DatabaseSync } from "node:sqlite";
import type { Organization, OrgType } from "./auth/accounts";
import { carrierName } from "./domain/carriers";
import type { PortAdapter } from "./ports/adapter";
import type { PortBookingSnapshot } from "./domain/types";

/**
 * Shared bookings (P-001, D-015).
 *
 * A booking is one record per carrier + booking number. An organization can see it when:
 *  - it is a party to the booking (it added it, or was added), or
 *  - it is the carrier organization for the booking's carrier code (implicitly verified).
 *
 * "Claimed" parties added the booking themselves and see port data only.
 * "Verified" parties were confirmed by the carrier and will see shared data as it's added.
 */

export type PartyRole = "exporter" | "carrier" | "trucker" | "terminal" | "warehouse" | "forwarder";
export type PartyStatus = "claimed" | "verified";

export const PARTY_ROLE_LABELS: Record<PartyRole, string> = {
  exporter: "Exporter",
  carrier: "Carrier",
  trucker: "Trucker",
  terminal: "Terminal",
  warehouse: "Warehouse",
  forwarder: "Forwarder",
};

const ROLE_FOR_ORG_TYPE: Record<OrgType, PartyRole> = {
  exporter: "exporter",
  ocean_carrier: "carrier",
  trucking: "trucker",
  port: "terminal",
  warehouse: "warehouse",
  forwarder: "forwarder",
};

/** The organization looking at bookings. */
export type Viewer = Pick<Organization, "id" | "type" | "carrierCode">;

export interface BookingAccess {
  role: PartyRole;
  status: PartyStatus;
  /** "carrier": the viewer is the booking's carrier. "party": the viewer is attached to the booking. */
  via: "carrier" | "party";
  /**
   * Parties only see history from when they joined, so a company can't tell that
   * someone else was tracking the same booking before it. Null for the carrier.
   */
  since: string | null;
}

export interface StoredSnapshot {
  id: number;
  fetchedAt: string;
  source: string;
  data: PortBookingSnapshot | null;
  error: string | null;
}

export interface TrackedBooking {
  id: number;
  carrierCode: string;
  bookingNumber: string;
  createdAt: string;
  access: BookingAccess;
  latest: StoredSnapshot | null;
  /** Latest earlier snapshot that has data, used for "what changed". */
  previous: StoredSnapshot | null;
}

export interface Party {
  orgId: number;
  orgName: string;
  role: PartyRole;
  status: PartyStatus;
  addedAt: string;
}

export class BookingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingError";
  }
}

/** Bookings stop auto-refreshing this long after their vessel's departure. */
const FINISHED_AFTER_MS = 24 * 60 * 60 * 1000;

/** A carrier code in SCAC form: four letters (e.g. MAEU). Any SCAC the port reports is accepted. */
const SCAC = /^[A-Z]{4}$/;

/** Booking numbers: letters, digits and dashes, 4–30 characters (Q-023). */
const BOOKING_NUMBER = /^[A-Z0-9-]{4,30}$/;

export function normalizeBookingNumber(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

/** SQL condition: booking `b` is visible to the viewer (params :org, :carrier). */
const VISIBLE = `(b.carrier_code = :carrier
  OR EXISTS (SELECT 1 FROM booking_parties vp WHERE vp.booking_id = b.id AND vp.org_id = :org))`;

function viewerParams(v: Viewer) {
  // A null carrier never equals anything in SQL, so non-carriers only match through parties.
  return { org: v.id, carrier: v.type === "ocean_carrier" ? v.carrierCode : null };
}

interface BookingRow {
  id: number;
  carrier_code: string;
  booking_number: string;
  created_at: string;
}

interface SnapshotRow {
  id: number;
  fetched_at: string;
  source: string;
  data: string | null;
  error: string | null;
}

export class BookingService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly adapter: PortAdapter,
  ) {}

  /**
   * S-001: the viewer starts tracking carrier + booking number. Finds or creates the shared
   * booking, attaches the viewer as a claimed party, and fetches port data if it's new.
   */
  async add(
    viewer: Viewer,
    input: { carrierCode: string; bookingNumber: string },
    addedBy: number | null = null,
  ): Promise<{ id: number; created: boolean }> {
    const bookingNumber = normalizeBookingNumber(input.bookingNumber);
    if (!BOOKING_NUMBER.test(bookingNumber)) {
      throw new BookingError("Booking numbers should be 4 to 30 letters, digits or dashes.");
    }
    // No carrier chosen: find it at the port (D-033).
    const carrierCode = input.carrierCode.trim() ? input.carrierCode.trim().toUpperCase() : await this.detectCarrier(bookingNumber);
    if (!SCAC.test(carrierCode)) throw new BookingError("Choose the carrier that issued this booking.");
    if (viewer.type === "ocean_carrier" && viewer.carrierCode !== carrierCode) {
      throw new BookingError("Carriers can only add their own bookings.");
    }

    let booking = this.db
      .prepare("SELECT id FROM bookings WHERE carrier_code = ? AND booking_number = ?")
      .get(carrierCode, bookingNumber) as { id: number } | undefined;
    const isNewBooking = !booking;
    if (!booking) {
      const r = this.db
        .prepare("INSERT INTO bookings (carrier_code, booking_number, created_at) VALUES (?, ?, ?)")
        .run(carrierCode, bookingNumber, new Date().toISOString());
      booking = { id: Number(r.lastInsertRowid) };
    }

    // Carriers see their bookings implicitly; everyone else needs a party link.
    let created = isNewBooking;
    if (viewer.type !== "ocean_carrier") {
      const existing = this.db
        .prepare("SELECT 1 FROM booking_parties WHERE booking_id = ? AND org_id = ?")
        .get(booking.id, viewer.id);
      if (!existing) {
        this.db
          .prepare(
            "INSERT INTO booking_parties (booking_id, org_id, role, status, added_by, created_at) VALUES (?, ?, ?, 'claimed', ?, ?)",
          )
          .run(booking.id, viewer.id, ROLE_FOR_ORG_TYPE[viewer.type], addedBy, new Date().toISOString());
        created = true;
      } else {
        created = false;
      }
    }
    // Port data is shared, but a newly attached party gets a fresh reading so its history starts now.
    if (created) await this.fetch(booking.id);
    return { id: booking.id, created };
  }

  /** The one carrier the port has this booking number under, or a clear reason to ask the user. */
  private async detectCarrier(bookingNumber: string): Promise<string> {
    let found: string[];
    try {
      found = await this.adapter.findCarriers(bookingNumber);
    } catch {
      throw new BookingError("Couldn't reach the port to find the carrier. Choose the carrier and try again.");
    }
    if (found.length === 1) return found[0];
    if (found.length === 0) {
      throw new BookingError(
        "The terminal doesn't have this booking yet, so Efficio can't tell its carrier. Choose the carrier to start tracking it anyway.",
      );
    }
    throw new BookingError(`This booking number exists under more than one carrier (${found.map(carrierName).join(", ")}). Choose the carrier.`);
  }

  /** How the viewer can see this booking, or null if it can't. */
  access(viewer: Viewer, bookingId: number): BookingAccess | null {
    const b = this.db.prepare("SELECT carrier_code FROM bookings WHERE id = ?").get(bookingId) as
      | { carrier_code: string }
      | undefined;
    if (!b) return null;
    if (viewer.type === "ocean_carrier" && viewer.carrierCode === b.carrier_code) {
      return { role: "carrier", status: "verified", via: "carrier", since: null };
    }
    const p = this.db
      .prepare("SELECT role, status, created_at FROM booking_parties WHERE booking_id = ? AND org_id = ?")
      .get(bookingId, viewer.id) as { role: PartyRole; status: PartyStatus; created_at: string } | undefined;
    return p ? { role: p.role, status: p.status, via: "party", since: p.created_at } : null;
  }

  list(viewer: Viewer): TrackedBooking[] {
    const rows = this.db
      .prepare(`SELECT b.* FROM bookings b WHERE ${VISIBLE} ORDER BY b.created_at DESC, b.id DESC`)
      .all(viewerParams(viewer)) as unknown as BookingRow[];
    return rows.map((r) => this.toTracked(r, this.access(viewer, r.id)!));
  }

  get(viewer: Viewer, id: number): TrackedBooking | null {
    const access = this.access(viewer, id);
    if (!access) return null;
    const r = this.db.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as unknown as BookingRow;
    return this.toTracked(r, access);
  }

  /** S-012: refresh port data for a booking the viewer can see. */
  async refresh(viewer: Viewer, id: number): Promise<StoredSnapshot> {
    if (!this.access(viewer, id)) throw new BookingError("Booking not found.");
    return this.fetch(id);
  }

  /** Refresh every booking the viewer can see, or (no viewer) every booking anyone is following. */
  async refreshAll(viewer?: Viewer): Promise<number> {
    const rows = (
      viewer
        ? this.db.prepare(`SELECT b.id FROM bookings b WHERE ${VISIBLE}`).all(viewerParams(viewer))
        : this.db
            .prepare(
              `SELECT b.id FROM bookings b
               WHERE EXISTS (SELECT 1 FROM booking_parties p WHERE p.booking_id = b.id)
                  OR EXISTS (SELECT 1 FROM organizations o WHERE o.carrier_code = b.carrier_code)`,
            )
            .all()
    ) as { id: number }[];
    for (const r of rows) await this.fetch(r.id);
    return rows.length;
  }

  /**
   * Scheduled refresh (D-017): every followed booking, except ones whose vessel sailed more
   * than a day ago. Those won't change in ways exporters act on, so we stop spending API calls.
   */
  async refreshDue(now: Date = new Date()): Promise<{ refreshed: number; skipped: number }> {
    const rows = this.db
      .prepare(
        `SELECT b.id,
           (SELECT s.data FROM snapshots s WHERE s.booking_id = b.id AND s.data IS NOT NULL ORDER BY s.id DESC LIMIT 1) AS data
         FROM bookings b
         WHERE EXISTS (SELECT 1 FROM booking_parties p WHERE p.booking_id = b.id)
            OR EXISTS (SELECT 1 FROM organizations o WHERE o.carrier_code = b.carrier_code)`,
      )
      .all() as { id: number; data: string | null }[];
    let refreshed = 0;
    let skipped = 0;
    for (const r of rows) {
      const etd = r.data ? (JSON.parse(r.data) as PortBookingSnapshot).vesselVisit?.etd : null;
      if (etd && Date.parse(etd) < now.getTime() - FINISHED_AFTER_MS) {
        skipped++;
        continue;
      }
      await this.fetch(r.id);
      refreshed++;
    }
    return { refreshed, skipped };
  }

  /** The viewer stops following a booking. The shared record goes once nobody follows it. */
  remove(viewer: Viewer, id: number): void {
    this.db.prepare("DELETE FROM booking_parties WHERE booking_id = ? AND org_id = ?").run(id, viewer.id);
    this.deleteIfUnfollowed(id);
  }

  /**
   * Who is on a booking. The carrier sees every party (to verify them).
   * Everyone else sees only their own link: one exporter must never learn that
   * another company claimed the same booking.
   */
  parties(viewer: Viewer, id: number): Party[] {
    const access = this.access(viewer, id);
    if (!access) return [];
    const all = this.db
      .prepare(
        `SELECT p.org_id, o.name, p.role, p.status, p.created_at FROM booking_parties p
         JOIN organizations o ON o.id = p.org_id WHERE p.booking_id = ? ORDER BY p.created_at`,
      )
      .all(id) as { org_id: number; name: string; role: PartyRole; status: PartyStatus; created_at: string }[];
    return all
      .filter((p) => access.via === "carrier" || p.org_id === viewer.id)
      .map((p) => ({ orgId: p.org_id, orgName: p.name, role: p.role, status: p.status, addedAt: p.created_at }));
  }

  /** The carrier confirms a party really is on its booking. */
  verifyParty(viewer: Viewer, bookingId: number, orgId: number): void {
    this.requireCarrier(viewer, bookingId);
    this.db.prepare("UPDATE booking_parties SET status = 'verified' WHERE booking_id = ? AND org_id = ?").run(bookingId, orgId);
  }

  /** The carrier removes a party that shouldn't be on its booking. */
  removeParty(viewer: Viewer, bookingId: number, orgId: number): void {
    this.requireCarrier(viewer, bookingId);
    this.db.prepare("DELETE FROM booking_parties WHERE booking_id = ? AND org_id = ?").run(bookingId, orgId);
    this.deleteIfUnfollowed(bookingId);
  }

  /** Snapshot history the viewer may see (from when it joined, for parties). */
  history(viewer: Viewer, id: number, limit = 20): StoredSnapshot[] {
    const access = this.access(viewer, id);
    if (!access) return [];
    return this.snapshots(id, access.since, limit);
  }

  private snapshots(id: number, since: string | null, limit: number): StoredSnapshot[] {
    const rows = this.db
      .prepare(
        "SELECT id, fetched_at, source, data, error FROM snapshots WHERE booking_id = ? AND fetched_at >= ? ORDER BY id DESC LIMIT ?",
      )
      .all(id, since ?? "", limit) as unknown as SnapshotRow[];
    return rows.map(toStored);
  }

  private requireCarrier(viewer: Viewer, bookingId: number): void {
    if (this.access(viewer, bookingId)?.via !== "carrier") throw new BookingError("Only the booking's carrier can do this.");
  }

  /** Removes every booking nobody follows any more (e.g. after removing sample data). */
  deleteAllUnfollowed(): void {
    this.db
      .prepare(
        `DELETE FROM bookings
         WHERE NOT EXISTS (SELECT 1 FROM booking_parties p WHERE p.booking_id = bookings.id)
           AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.carrier_code = bookings.carrier_code)`,
      )
      .run();
  }

  private deleteIfUnfollowed(id: number): void {
    this.db
      .prepare(
        `DELETE FROM bookings WHERE id = ?
         AND NOT EXISTS (SELECT 1 FROM booking_parties p WHERE p.booking_id = bookings.id)
         AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.carrier_code = bookings.carrier_code)`,
      )
      .run(id);
  }

  /** Fetch port data and store it as a new snapshot (errors are stored too). */
  private async fetch(id: number): Promise<StoredSnapshot> {
    const row = this.db.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as BookingRow | undefined;
    if (!row) throw new BookingError("Booking not found.");
    let data: PortBookingSnapshot | null = null;
    let error: string | null = null;
    try {
      data = await this.adapter.lookupBooking({ carrierCode: row.carrier_code, bookingNumber: row.booking_number });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const fetchedAt = data?.fetchedAt ?? new Date().toISOString();
    const result = this.db
      .prepare("INSERT INTO snapshots (booking_id, fetched_at, source, data, error) VALUES (?, ?, ?, ?, ?)")
      .run(id, fetchedAt, this.adapter.source, data ? JSON.stringify(data) : null, error);
    return { id: Number(result.lastInsertRowid), fetchedAt, source: this.adapter.source, data, error };
  }

  private toTracked(r: BookingRow, access: BookingAccess): TrackedBooking {
    const latest = this.snapshots(r.id, access.since, 1)[0] ?? null;
    const prevRow = latest
      ? (this.db
          .prepare(
            "SELECT id, fetched_at, source, data, error FROM snapshots WHERE booking_id = ? AND id < ? AND fetched_at >= ? AND data IS NOT NULL ORDER BY id DESC LIMIT 1",
          )
          .get(r.id, latest.id, access.since ?? "") as SnapshotRow | undefined)
      : undefined;
    return {
      id: r.id,
      carrierCode: r.carrier_code,
      bookingNumber: r.booking_number,
      createdAt: r.created_at,
      access,
      latest,
      previous: prevRow ? toStored(prevRow) : null,
    };
  }
}

function toStored(r: SnapshotRow): StoredSnapshot {
  return {
    id: r.id,
    fetchedAt: r.fetched_at,
    source: r.source,
    data: r.data ? (JSON.parse(r.data) as PortBookingSnapshot) : null,
    error: r.error,
  };
}
