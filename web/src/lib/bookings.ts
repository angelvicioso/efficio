import type { DatabaseSync } from "node:sqlite";
import type { PortAdapter } from "./ports/adapter";
import type { PortBookingSnapshot } from "./domain/types";

export interface StoredSnapshot {
  id: number;
  fetchedAt: string;
  source: string;
  data: PortBookingSnapshot | null;
  error: string | null;
}

export interface TrackedBooking {
  id: number;
  bookingNumber: string;
  createdAt: string;
  latest: StoredSnapshot | null;
  /** Latest snapshot that has data, used for "what changed". */
  previous: StoredSnapshot | null;
}

/** Booking numbers: letters, digits and dashes, 4–30 characters (to confirm with Orlando). */
const BOOKING_NUMBER = /^[A-Z0-9-]{4,30}$/;

export function normalizeBookingNumber(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export class BookingService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly adapter: PortAdapter,
  ) {}

  /** S-001: start tracking a booking and fetch it once right away. */
  async add(input: string): Promise<{ id: number; created: boolean }> {
    const bookingNumber = normalizeBookingNumber(input);
    if (!BOOKING_NUMBER.test(bookingNumber)) {
      throw new Error("Booking numbers should be 4 to 30 letters, digits or dashes.");
    }
    const existing = this.db.prepare("SELECT id FROM bookings WHERE booking_number = ?").get(bookingNumber) as
      | { id: number }
      | undefined;
    if (existing) return { id: existing.id, created: false };

    const result = this.db
      .prepare("INSERT INTO bookings (booking_number, created_at) VALUES (?, ?)")
      .run(bookingNumber, new Date().toISOString());
    const id = Number(result.lastInsertRowid);
    await this.refresh(id);
    return { id, created: true };
  }

  /** S-012: fetch the latest data and store it as a new snapshot (errors are stored too). */
  async refresh(id: number): Promise<StoredSnapshot> {
    const row = this.db.prepare("SELECT booking_number FROM bookings WHERE id = ?").get(id) as
      | { booking_number: string }
      | undefined;
    if (!row) throw new Error(`Booking ${id} not found`);

    let data: PortBookingSnapshot | null = null;
    let error: string | null = null;
    try {
      data = await this.adapter.lookupBooking(row.booking_number);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const fetchedAt = data?.fetchedAt ?? new Date().toISOString();
    const result = this.db
      .prepare("INSERT INTO snapshots (booking_id, fetched_at, source, data, error) VALUES (?, ?, ?, ?, ?)")
      .run(id, fetchedAt, this.adapter.source, data ? JSON.stringify(data) : null, error);
    return { id: Number(result.lastInsertRowid), fetchedAt, source: this.adapter.source, data, error };
  }

  async refreshAll(): Promise<number> {
    const rows = this.db.prepare("SELECT id FROM bookings").all() as { id: number }[];
    for (const r of rows) await this.refresh(r.id);
    return rows.length;
  }

  remove(id: number): void {
    this.db.prepare("DELETE FROM bookings WHERE id = ?").run(id);
  }

  list(): TrackedBooking[] {
    const rows = this.db
      .prepare("SELECT id, booking_number, created_at FROM bookings ORDER BY created_at DESC, id DESC")
      .all() as { id: number; booking_number: string; created_at: string }[];
    return rows.map((r) => this.toTracked(r));
  }

  get(id: number): TrackedBooking | null {
    const r = this.db.prepare("SELECT id, booking_number, created_at FROM bookings WHERE id = ?").get(id) as
      | { id: number; booking_number: string; created_at: string }
      | undefined;
    return r ? this.toTracked(r) : null;
  }

  history(id: number, limit = 20): StoredSnapshot[] {
    const rows = this.db
      .prepare("SELECT id, fetched_at, source, data, error FROM snapshots WHERE booking_id = ? ORDER BY id DESC LIMIT ?")
      .all(id, limit) as unknown as SnapshotRow[];
    return rows.map(toStored);
  }

  private toTracked(r: { id: number; booking_number: string; created_at: string }): TrackedBooking {
    const latest = this.history(r.id, 1)[0] ?? null;
    const prevRow = latest
      ? (this.db
          .prepare(
            "SELECT id, fetched_at, source, data, error FROM snapshots WHERE booking_id = ? AND id < ? AND data IS NOT NULL ORDER BY id DESC LIMIT 1",
          )
          .get(r.id, latest.id) as SnapshotRow | undefined)
      : undefined;
    return {
      id: r.id,
      bookingNumber: r.booking_number,
      createdAt: r.created_at,
      latest,
      previous: prevRow ? toStored(prevRow) : null,
    };
  }
}

interface SnapshotRow {
  id: number;
  fetched_at: string;
  source: string;
  data: string | null;
  error: string | null;
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
