import type { TrackedBooking } from "@/lib/bookings";
import { carrierName } from "./carriers";
import { containerProgress, remainingToDeliver, remainingToPickUp } from "./containers";
import { receivingStatus, type ReceivingState } from "./status";
import { TERMINAL_LABELS, type Terminal } from "./types";

/** Filters for the bookings list (S-047). All optional; they combine (AND). */
export interface BookingFilters {
  q: string;
  carrier: string;
  vessel: string;
  status: ReceivingState | "";
  terminal: Terminal | "";
  action: "pickup" | "deliver" | "";
}

export const NO_FILTERS: BookingFilters = { q: "", carrier: "", vessel: "", status: "", terminal: "", action: "" };

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
  };
}

export function isFiltered(f: BookingFilters): boolean {
  return Object.values(f).some(Boolean);
}

export function filterBookings(list: TrackedBooking[], f: BookingFilters, now: Date = new Date()): TrackedBooking[] {
  const q = f.q.toUpperCase();
  return list.filter((b) => {
    const snap = b.latest?.data ?? null;
    if (q && !b.bookingNumber.includes(q) && !(snap?.vesselVisit?.vesselName ?? "").toUpperCase().includes(q)) return false;
    if (f.carrier && b.carrierCode !== f.carrier) return false;
    if (f.vessel && snap?.vesselVisit?.id !== f.vessel) return false;
    if (f.terminal && snap?.terminal !== f.terminal) return false;
    if (f.status && (!snap || receivingStatus(snap, now).state !== f.status)) return false;
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
