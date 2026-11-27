import type { TrackedBooking } from "@/lib/bookings";
import { carrierName } from "./carriers";
import { containerProgress } from "./containers";
import { cargoCutoff, receivingStatus, type ReceivingState } from "./status";

/** Sortable columns on the bookings list. */
export const SORT_KEYS = ["booking", "carrier", "status", "opens", "cutoff", "containers", "pickedUp", "atTerminal", "updated"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export function parseSort(sort: string | undefined, dir: string | undefined): { key: SortKey | null; dir: SortDir } {
  const key = (SORT_KEYS as readonly string[]).includes(sort ?? "") ? (sort as SortKey) : null;
  return { key, dir: dir === "desc" ? "desc" : "asc" };
}

/** Status in order of urgency, so "ascending" puts what needs attention first. */
const STATE_RANK: Record<ReceivingState, number> = {
  CLOSING_SOON: 0,
  OPEN: 1,
  NOT_OPEN: 2,
  DATES_PENDING: 3,
  NOT_ON_FILE: 4,
  CLOSED: 5,
};

type Value = string | number | null;

function valueOf(b: TrackedBooking, key: SortKey, now: Date): Value {
  const snap = b.latest?.data ?? null;
  const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);
  switch (key) {
    case "booking":
      return b.bookingNumber;
    case "carrier":
      return carrierName(b.carrierCode);
    case "status": {
      if (!snap) return null;
      const s = receivingStatus(snap, now);
      // Within a state, the sooner milestone first.
      return STATE_RANK[s.state] * 1e13 + (s.msUntilNext ?? 0);
    }
    case "opens":
      return time(snap?.receivingOpensAt);
    case "cutoff":
      return time(snap ? cargoCutoff(snap) : null);
    case "containers":
      return snap?.onFile ? containerProgress(snap).booked : null;
    case "pickedUp":
      return snap?.onFile ? containerProgress(snap).pickedUp : null;
    case "atTerminal":
      return snap?.onFile ? containerProgress(snap).atTerminal : null;
    case "updated":
      return time(b.latest?.fetchedAt);
  }
}

/** Sorts a copy. Missing values always go last, whichever the direction; ties keep the original order. */
export function sortBookings(bookings: TrackedBooking[], key: SortKey | null, dir: SortDir, now: Date = new Date()): TrackedBooking[] {
  if (!key) return bookings;
  const sign = dir === "desc" ? -1 : 1;
  return bookings
    .map((b, i) => ({ b, i, v: valueOf(b, key, now) }))
    .sort((x, y) => {
      if (x.v === null && y.v === null) return x.i - y.i;
      if (x.v === null) return 1;
      if (y.v === null) return -1;
      const c = typeof x.v === "string" ? x.v.localeCompare(String(y.v), undefined, { numeric: true }) : x.v - (y.v as number);
      return c !== 0 ? sign * c : x.i - y.i;
    })
    .map((x) => x.b);
}
