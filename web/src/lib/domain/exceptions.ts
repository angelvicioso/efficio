import type { TrackedBooking } from "@/lib/bookings";
import { containerProgress, remainingToDeliver, remainingToPickUp } from "./containers";
import { cargoCutoff, formatDuration } from "./status";

/**
 * Exceptions: bookings that need attention, and why (S-049, D-036).
 * Container exceptions start ATTENTION_WINDOW_MS before the cargo cutoff (Eduardo: 1 day).
 */
export const ATTENTION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ExceptionKind =
  | "EMPTIES_NOT_PICKED_UP"
  | "NOT_DELIVERED"
  | "CUTOFF_PASSED_NOT_DELIVERED"
  | "ROLLED"
  | "ON_HOLD"
  | "VGM_MISSING"
  | "STORAGE"
  | "DETENTION"
  | "VESSEL_SCHEDULE_CHANGED"
  | "CUTOFF_MOVED_EARLIER"
  | "NO_UPDATE";
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
  ROLLED: { label: "Moved to another vessel", severity: "critical", explain: "The terminal plans to load a container on a different vessel than the booking's (rolled)." },
  ON_HOLD: { label: "Container on hold", severity: "critical", explain: "A customs, line or terminal hold blocks a container. Critical within 24 hours of the cargo cutoff or after it; a warning before that." },
  VGM_MISSING: { label: "VGM missing", severity: "critical", explain: "Cargo cutoff within 24 hours, and a delivered container has no verified gross mass (VGM). It won't be loaded without one." },
  STORAGE: { label: "Storage charges", severity: "critical", explain: "A container's free time at the terminal has ended (critical) or ends within 24 hours (warning)." },
  DETENTION: { label: "Carrier detention", severity: "warning", explain: "Empties picked up and not yet delivered full, held past the carrier's free days: detention is adding up." },
  VESSEL_SCHEDULE_CHANGED: { label: "Vessel schedule changed", severity: "warning", explain: "The vessel's departure moved earlier or later in the latest update." },
  CUTOFF_MOVED_EARLIER: { label: "Cutoff moved earlier", severity: "warning", explain: "The terminal moved the cargo cutoff earlier in its latest update." },
  NO_UPDATE: { label: "No update from the port", severity: "warning", explain: "The last check with the port failed, so the data may be out of date." },
};

export const EXCEPTION_KINDS = Object.keys(EXCEPTION_LABELS) as ExceptionKind[];

/** Company settings that change when something is an exception (from its Rates). */
export interface ExceptionOptions {
  /** Carrier detention free days (empty out to full in). Default 3. */
  detentionFreeDays?: number;
}

export function bookingExceptions(b: TrackedBooking, now: Date = new Date(), opts: ExceptionOptions = {}): BookingException[] {
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

  const containers = snap.containers ?? [];
  const notLoaded = containers.filter((c) => c.stage !== "LOADED_ON_VESSEL");
  const within = msLeft > 0 && msLeft <= ATTENTION_WINDOW_MS;
  const urgent = within || msLeft <= 0;
  const etdMs = snap.vesselVisit?.etd ? Date.parse(snap.vesselVisit.etd) : null;
  const sailed = etdMs !== null && etdMs <= t;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  // Rolled (S-052): planned on a different vessel than the booking's.
  const bookedVessel = snap.vesselVisit?.id;
  const rolled = notLoaded.filter((c) => c.plannedVessel && bookedVessel && c.plannedVessel.id !== bookedVessel);
  if (rolled.length) {
    const to = rolled[0].plannedVessel!;
    out.push({
      kind: "ROLLED",
      severity: "critical",
      title: `${plural(rolled.length, "container", "containers")} moved to another vessel`,
      detail: `${rolled.map((c) => c.number).join(", ")} now planned on ${to.name ?? to.id}`,
    });
  }

  // Holds (S-051): critical close to or after the cutoff, a warning before.
  const held = notLoaded.filter((c) => (c.holds?.length ?? 0) > 0);
  if (held.length && !sailed) {
    const kinds = [...new Set(held.flatMap((c) => c.holds!))].join(", ");
    out.push({
      kind: "ON_HOLD",
      severity: urgent ? "critical" : "warning",
      title: `${plural(held.length, "container", "containers")} on hold (${kinds})`,
      detail: msLeft > 0 ? `cutoff in ${formatDuration(msLeft)}` : "cutoff has passed",
    });
  }

  // VGM (S-056): delivered containers without a submitted VGM, within 24h of cutoff.
  const noVgm = containers.filter((c) => c.stage === "FULL_AT_TERMINAL" && c.vgmVerifiedAt === null);
  if (noVgm.length && within) {
    out.push({
      kind: "VGM_MISSING",
      severity: "critical",
      title: `${plural(noVgm.length, "container", "containers")} without VGM`,
      detail: `${noVgm.map((c) => c.number).join(", ")} · cutoff in ${formatDuration(msLeft)}`,
    });
  }

  // Storage (S-058): free time over (critical) or ending within 24h (warning), while still at the terminal.
  const atTerminal = containers.filter((c) => c.stage === "FULL_AT_TERMINAL" && c.lastFreeDay);
  const overdue = atTerminal.filter((c) => Date.parse(c.lastFreeDay!) <= t);
  const ending = atTerminal.filter((c) => Date.parse(c.lastFreeDay!) > t && Date.parse(c.lastFreeDay!) - t <= ATTENTION_WINDOW_MS);
  if (overdue.length) {
    const since = Math.min(...overdue.map((c) => Date.parse(c.lastFreeDay!)));
    out.push({ kind: "STORAGE", severity: "critical", title: `${plural(overdue.length, "container", "containers")} past free time`, detail: `storage charges for ${formatDuration(t - since)}` });
  } else if (ending.length) {
    const first = Math.min(...ending.map((c) => Date.parse(c.lastFreeDay!)));
    out.push({ kind: "STORAGE", severity: "warning", title: `Free time ends for ${plural(ending.length, "container", "containers")}`, detail: `in ${formatDuration(first - t)}` });
  }

  // Detention (S-060): empties out longer than the carrier's free days, not yet back full.
  const freeDays = opts.detentionFreeDays ?? 3;
  const overFree = containers.filter((c) => c.stage === "EMPTY_PICKED_UP" && c.emptyPickedUpAt && t - Date.parse(c.emptyPickedUpAt) > freeDays * 24 * 60 * 60 * 1000);
  if (overFree.length) {
    const longest = Math.max(...overFree.map((c) => t - Date.parse(c.emptyPickedUpAt!)));
    out.push({
      kind: "DETENTION",
      severity: "warning",
      title: `${plural(overFree.length, "empty", "empties")} out past ${freeDays} free days`,
      detail: `longest out ${formatDuration(longest)}; detention is adding up`,
    });
  }

  // Vessel schedule (S-054): departure moved since the last update.
  const prevEtd = b.previous?.data?.vesselVisit?.etd;
  if (prevEtd && etdMs !== null && !sailed && b.previous?.data?.vesselVisit?.id === bookedVessel) {
    const moved = etdMs - Date.parse(prevEtd);
    if (Math.abs(moved) >= 60 * 60 * 1000) {
      out.push({
        kind: "VESSEL_SCHEDULE_CHANGED",
        severity: "warning",
        title: `Vessel departure moved ${formatDuration(Math.abs(moved))} ${moved > 0 ? "later" : "earlier"}`,
        detail: `now departs in ${formatDuration(etdMs - t)}`,
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
export function exceptionSummary(bookings: TrackedBooking[], now: Date = new Date(), opts: ExceptionOptions = {}): { kind: ExceptionKind; count: number }[] {
  const counts = new Map<ExceptionKind, number>();
  for (const b of bookings) for (const k of new Set(bookingExceptions(b, now, opts).map((e) => e.kind))) counts.set(k, (counts.get(k) ?? 0) + 1);
  return EXCEPTION_KINDS.filter((k) => counts.has(k)).map((kind) => ({ kind, count: counts.get(kind)! }));
}

/** Sort value: critical first, then warnings, then the rest; sooner cutoff first within each. */
export function attentionRank(b: TrackedBooking, now: Date = new Date()): number {
  const sev = worstSeverity(bookingExceptions(b, now));
  const base = sev === "critical" ? 0 : sev === "warning" ? 1 : 2;
  const cutoff = b.latest?.data ? cargoCutoff(b.latest.data) : null;
  return base * 1e14 + (cutoff ? Date.parse(cutoff) : 9e13);
}
