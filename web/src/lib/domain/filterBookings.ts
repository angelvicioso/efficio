import type { TrackedBooking } from "@/lib/bookings";
import { carrierName } from "./carriers";
import { containerProgress, remainingToDeliver, remainingToPickUp } from "./containers";
import { cargoCutoff, receivingStatus, type ReceivingState } from "./status";
import { bookingExceptions, EXCEPTION_KINDS, type ExceptionKind } from "./exceptions";
import { TERMINAL_LABELS, type Terminal } from "./types";

/** Filters for the bookings list (S-047). All optional; they combine (AND). */
export interface BookingFilters {
  q: string;
  carrier: string;
  vessel: string;
  status: ReceivingState | "";
  terminal: Terminal | "";
  action: "pickup" | "deliver" | "";
  /** Exceptions (S-049): a specific kind, or "any". */
  exception: ExceptionKind | "any" | "";
  /** Date filter (S-048): which date, and a preset window or custom Houston-time days. */
  dateField: DateField | "";
  range: DateRange | "";
  from: string;
  to: string;
}

export type DateField = "cutoff" | "opens" | "departs";
export type DateRange = "next24h" | "next48h" | "next7d" | "next14d" | "past7d" | "custom";

export const DATE_FIELD_LABELS: Record<DateField, string> = { cutoff: "Cargo cutoff", opens: "Receiving opens", departs: "Vessel departs" };
export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  next24h: "Next 24 hours",
  next48h: "Next 48 hours",
  next7d: "Next 7 days",
  next14d: "Next 14 days",
  past7d: "Past 7 days",
  custom: "Custom dates…",
};

export const NO_FILTERS: BookingFilters = { q: "", carrier: "", vessel: "", status: "", terminal: "", action: "", exception: "", dateField: "", range: "", from: "", to: "" };

const HOUSTON = "America/Chicago";
const HOUR = 3_600_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Minutes Houston is behind UTC at a given instant (360 in winter, 300 in summer). */
function houstonOffsetMinutes(at: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: HOUSTON, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((at - asUtc) / 60_000);
}

/** The instant a Houston calendar day ("2026-11-27") starts, handling daylight saving. */
export function houstonDayStart(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 6); // midnight CST
  return Date.UTC(y, m - 1, d) + houstonOffsetMinutes(guess) * 60_000;
}

function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** The [start, end) window for a date filter, or null if incomplete. */
export function dateWindow(f: BookingFilters, now: Date = new Date()): [number, number] | null {
  const t = now.getTime();
  switch (f.range) {
    case "next24h":
      return [t, t + 24 * HOUR];
    case "next48h":
      return [t, t + 48 * HOUR];
    case "next7d":
      return [t, t + 7 * 24 * HOUR];
    case "next14d":
      return [t, t + 14 * 24 * HOUR];
    case "past7d":
      return [t - 7 * 24 * HOUR, t];
    case "custom": {
      if (!f.from && !f.to) return null;
      const start = f.from ? houstonDayStart(f.from) : Number.NEGATIVE_INFINITY;
      // "To" includes that whole Houston day: the window ends when the next day starts.
      const end = f.to ? houstonDayStart(nextDay(f.to)) : Number.POSITIVE_INFINITY;
      return [start, end];
    }
    default:
      return null;
  }
}

export const STATUS_LABELS: Record<ReceivingState, string> = {
  CLOSING_SOON: "Closing soon",
  OPEN: "Open",
  NOT_OPEN: "Not open yet",
  DATES_PENDING: "On file, dates pending",
  NOT_ON_FILE: "Not at terminal yet",
  CLOSED: "Receiving closed",
};

export const ACTION_LABELS = { pickup: "Empties still to pick up", deliver: "Still to deliver to terminal" } as const;

/** Reads filters from the page address, ignoring anything unexpected. */
export function parseFilters(sp: Record<string, string | undefined>): BookingFilters {
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[]): T | "" => ((allowed as readonly string[]).includes(v ?? "") ? (v as T) : "");
  return {
    q: (sp.q ?? "").trim().slice(0, 60),
    carrier: /^[A-Za-z]{4}$/.test(sp.carrier ?? "") ? sp.carrier!.toUpperCase() : "",
    vessel: (sp.vessel ?? "").trim().slice(0, 40),
    status: pick(sp.status, Object.keys(STATUS_LABELS) as ReceivingState[]),
    terminal: pick(sp.terminal, Object.keys(TERMINAL_LABELS) as Terminal[]),
    action: pick(sp.action, ["pickup", "deliver"] as const),
    exception: pick(sp.exception, ["any", ...EXCEPTION_KINDS] as const),
    dateField: pick(sp.dateField, Object.keys(DATE_FIELD_LABELS) as DateField[]),
    range: pick(sp.range, Object.keys(DATE_RANGE_LABELS) as DateRange[]),
    from: DAY_RE.test(sp.from ?? "") ? sp.from! : "",
    to: DAY_RE.test(sp.to ?? "") ? sp.to! : "",
  };
}

export function isFiltered(f: BookingFilters): boolean {
  const { dateField, range, from, to, ...rest } = f;
  // The date filter only counts once it has a window.
  return Object.values(rest).some(Boolean) || Boolean(range && (range !== "custom" || from || to));
}

function dateOf(b: TrackedBooking, field: DateField): number | null {
  const snap = b.latest?.data;
  if (!snap?.onFile) return null;
  const iso = field === "cutoff" ? cargoCutoff(snap) : field === "opens" ? snap.receivingOpensAt : (snap.vesselVisit?.etd ?? null);
  return iso ? Date.parse(iso) : null;
}

export function filterBookings(list: TrackedBooking[], f: BookingFilters, now: Date = new Date()): TrackedBooking[] {
  const q = f.q.toUpperCase();
  const window = dateWindow(f, now);
  const field: DateField = f.dateField || "cutoff";
  return list.filter((b) => {
    if (window) {
      const at = dateOf(b, field);
      if (at === null || at < window[0] || at >= window[1]) return false;
    }
    const snap = b.latest?.data ?? null;
    if (q && !b.bookingNumber.includes(q) && !(snap?.vesselVisit?.vesselName ?? "").toUpperCase().includes(q)) return false;
    if (f.carrier && b.carrierCode !== f.carrier) return false;
    if (f.vessel && snap?.vesselVisit?.id !== f.vessel) return false;
    if (f.terminal && snap?.terminal !== f.terminal) return false;
    if (f.status && (!snap || receivingStatus(snap, now).state !== f.status)) return false;
    if (f.exception) {
      const kinds = bookingExceptions(b, now).map((e) => e.kind);
      if (f.exception === "any" ? kinds.length === 0 : !kinds.includes(f.exception)) return false;
    }
    if (f.action) {
      if (!snap?.onFile) return false;
      const p = containerProgress(snap);
      if (f.action === "pickup" && remainingToPickUp(p) === 0) return false;
      if (f.action === "deliver" && remainingToDeliver(p) === 0) return false;
    }
    return true;
  });
}

/** Choices for the filter dropdowns: only values present in this organization's bookings. */
export function filterOptions(list: TrackedBooking[], now: Date = new Date()) {
  const carriers = new Map<string, string>();
  const vessels = new Map<string, string>();
  const terminals = new Set<Terminal>();
  const statuses = new Set<ReceivingState>();
  for (const b of list) {
    carriers.set(b.carrierCode, carrierName(b.carrierCode));
    const snap = b.latest?.data;
    if (!snap) continue;
    if (snap.vesselVisit?.id) vessels.set(snap.vesselVisit.id, `${snap.vesselVisit.vesselName}${snap.vesselVisit.voyage ? ` / ${snap.vesselVisit.voyage}` : ""}`);
    if (snap.terminal) terminals.add(snap.terminal);
    statuses.add(receivingStatus(snap, now).state);
  }
  const byLabel = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1]);
  return {
    carriers: [...carriers.entries()].sort(byLabel),
    vessels: [...vessels.entries()].sort(byLabel),
    terminals: [...terminals].map((t) => [t, TERMINAL_LABELS[t]] as [string, string]),
    statuses: (Object.keys(STATUS_LABELS) as ReceivingState[]).filter((s) => statuses.has(s)).map((s) => [s, STATUS_LABELS[s]] as [string, string]),
  };
}
