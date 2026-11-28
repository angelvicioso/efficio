import type { TrackedBooking } from "@/lib/bookings";
import { containerProgress, remainingToDeliver, remainingToPickUp } from "./containers";
import { cargoCutoff, formatDuration } from "./status";

/**
 * Exceptions: bookings that need attention, and why (S-049, D-036).
 * Container exceptions start ATTENTION_WINDOW_MS before the cargo cutoff (Eduardo: 1 day).
 */
export const ATTENTION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ExceptionKind = "EMPTIES_NOT_PICKED_UP" | "NOT_DELIVERED" | "CUTOFF_PASSED_NOT_DELIVERED" | "CUTOFF_MOVED_EARLIER" | "NO_UPDATE";
export type Severity = "critical" | "warning";

export interface BookingException {
  kind: ExceptionKind;
  severity: Severity;
  /** Short reason, e.g. "2 of 6 empties not picked up". */
  title: string;
  /** Context, e.g. "cutoff in 18h". */
  detail: string;
}

export const EXCEPTION_LABELS: Record<ExceptionKind, { label: string; severity: Severity; explain: string }> = {
  EMPTIES_NOT_PICKED_UP: { label: "Empties not picked up", severity: "critical", explain: "Cargo cutoff within 24 hours, and not every booked container has been picked up." },
  NOT_DELIVERED: { label: "Containers not delivered", severity: "critical", explain: "Cargo cutoff within 24 hours, and not every container is at the terminal." },
  CUTOFF_PASSED_NOT_DELIVERED: { label: "Cutoff passed, not delivered", severity: "critical", explain: "The cargo cutoff has passed, the vessel hasn't sailed, and containers are missing. They may be rolled to a later vessel." },
  CUTOFF_MOVED_EARLIER: { label: "Cutoff moved earlier", severity: "warning", explain: "The terminal moved the cargo cutoff earlier in its latest update." },
  NO_UPDATE: { label: "No update from the port", severity: "warning", explain: "The last check with the port failed, so the data may be out of date." },
};

export const EXCEPTION_KINDS = Object.keys(EXCEPTION_LABELS) as ExceptionKind[];

export function bookingExceptions(b: TrackedBooking, now: Date = new Date()): BookingException[] {
  const out: BookingException[] = [];
  const t = now.getTime();
  if (b.latest?.error) {
    out.push({ kind: "NO_UPDATE", severity: "warning", title: "No update from the port", detail: "the last check failed" });
  }
  const snap = b.latest?.data;
  if (!snap?.onFile) return out;
  const cutoffIso = cargoCutoff(snap);
  if (!cutoffIso) return out;
  const cutoff = Date.parse(cutoffIso);
  const msLeft = cutoff - t;
  const p = containerProgress(snap);

  if (p.booked > 0) {
    const toPickUp = remainingToPickUp(p);
    const toDeliver = remainingToDeliver(p);
    if (msLeft > 0 && msLeft <= ATTENTION_WINDOW_MS) {
      const when = `cutoff in ${formatDuration(msLeft)}`;
      if (toPickUp > 0) {
        out.push({ kind: "EMPTIES_NOT_PICKED_UP", severity: "critical", title: `${toPickUp} of ${p.booked} ${p.booked === 1 ? "empty" : "empties"} not picked up`, detail: when });
      }
      if (toDeliver > 0) {
        out.push({ kind: "NOT_DELIVERED", severity: "critical", title: `${toDeliver} of ${p.booked} not delivered to the terminal`, detail: when });
      }
    }
    const etd = snap.vesselVisit?.etd ? Date.parse(snap.vesselVisit.etd) : null;
    if (msLeft <= 0 && toDeliver > 0 && (etd === null || etd > t)) {
      out.push({
        kind: "CUTOFF_PASSED_NOT_DELIVERED",
        severity: "critical",
        title: `${toDeliver} of ${p.booked} missed the cargo cutoff`,
        detail: `cutoff was ${formatDuration(-msLeft)} ago; risk of being rolled`,
      });
    }
  }

  const prevIso = b.previous?.data ? cargoCutoff(b.previous.data) : null;
  if (prevIso && msLeft > 0) {
    const movedBy = Date.parse(prevIso) - cutoff;
    if (movedBy > 0) {
      out.push({ kind: "CUTOFF_MOVED_EARLIER", severity: "warning", title: `Cutoff moved ${formatDuration(movedBy)} earlier`, detail: `now in ${formatDuration(msLeft)}` });
    }
  }
  return out;
}

export function worstSeverity(list: BookingException[]): Severity | null {
  if (list.some((e) => e.severity === "critical")) return "critical";
  return list.length ? "warning" : null;
}

/** How many bookings have each kind of exception. */
export function exceptionSummary(bookings: TrackedBooking[], now: Date = new Date()): { kind: ExceptionKind; count: number }[] {
  const counts = new Map<ExceptionKind, number>();
  for (const b of bookings) for (const k of new Set(bookingExceptions(b, now).map((e) => e.kind))) counts.set(k, (counts.get(k) ?? 0) + 1);
  return EXCEPTION_KINDS.filter((k) => counts.has(k)).map((kind) => ({ kind, count: counts.get(kind)! }));
}

/** Sort value: critical first, then warnings, then the rest; sooner cutoff first within each. */
export function attentionRank(b: TrackedBooking, now: Date = new Date()): number {
  const sev = worstSeverity(bookingExceptions(b, now));
  const base = sev === "critical" ? 0 : sev === "warning" ? 1 : 2;
  const cutoff = b.latest?.data ? cargoCutoff(b.latest.data) : null;
  return base * 1e14 + (cutoff ? Date.parse(cutoff) : 9e13);
}
