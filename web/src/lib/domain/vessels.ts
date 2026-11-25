import type { TrackedBooking } from "@/lib/bookings";
import { addProgress, containerProgress, NO_PROGRESS, type ContainerProgress } from "./containers";
import { cargoCutoff, receivingStatus, type ReceivingState } from "./status";
import type { Terminal } from "./types";

/**
 * Grouping bookings for the Vessels (S-040) and Carriers (S-043) views. Only the viewer's
 * own bookings are ever passed in, so totals never include other companies' containers (Q-032).
 */

export interface GroupSummary {
  /** Sorted by cargo cutoff, earliest first. */
  bookings: TrackedBooking[];
  /** The booking whose cargo cutoff comes next (not yet passed), if any. */
  nextCutoff: { booking: TrackedBooking; at: string } | null;
  stateCounts: Partial<Record<ReceivingState, number>>;
  containers: ContainerProgress;
}

export interface VesselGroup extends GroupSummary {
  visitId: string;
  vesselName: string;
  terminal: Terminal | null;
  eta: string | null;
  etd: string | null;
}

export interface CarrierGroup extends GroupSummary {
  carrierCode: string;
  /** Distinct vessels this carrier's bookings are on. */
  vesselCount: number;
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY);
const cutoffOf = (b: TrackedBooking) => (b.latest?.data ? cargoCutoff(b.latest.data) : null);

export function summarize(bookings: TrackedBooking[], now: Date = new Date()): GroupSummary {
  const sorted = [...bookings].sort((a, b) => time(cutoffOf(a)) - time(cutoffOf(b)));
  const summary: GroupSummary = { bookings: sorted, nextCutoff: null, stateCounts: {}, containers: NO_PROGRESS };
  for (const b of sorted) {
    const snap = b.latest?.data;
    if (!snap) continue;
    const state = receivingStatus(snap, now).state;
    summary.stateCounts[state] = (summary.stateCounts[state] ?? 0) + 1;
    summary.containers = addProgress(summary.containers, containerProgress(snap));
    const cutoff = cargoCutoff(snap);
    if (cutoff && Date.parse(cutoff) > now.getTime() && (!summary.nextCutoff || Date.parse(cutoff) < Date.parse(summary.nextCutoff.at))) {
      summary.nextCutoff = { booking: b, at: cutoff };
    }
  }
  return summary;
}

export interface VesselGrouping {
  vessels: VesselGroup[];
  /** Bookings the terminal hasn't linked to a vessel yet (not on file, or no data). */
  unassigned: TrackedBooking[];
}

export function groupByVessel(bookings: TrackedBooking[], now: Date = new Date()): VesselGrouping {
  const byVisit = new Map<string, TrackedBooking[]>();
  const unassigned: TrackedBooking[] = [];
  for (const b of bookings) {
    const snap = b.latest?.data;
    const visit = snap?.onFile ? snap.vesselVisit : null;
    if (!visit?.id) {
      unassigned.push(b);
      continue;
    }
    byVisit.set(visit.id, [...(byVisit.get(visit.id) ?? []), b]);
  }
  const vessels: VesselGroup[] = [...byVisit.entries()].map(([visitId, list]) => {
    const snap = list[0].latest!.data!;
    return {
      visitId,
      vesselName: snap.vesselVisit!.vesselName,
      terminal: snap.terminal,
      eta: snap.vesselVisit!.eta,
      etd: snap.vesselVisit!.etd,
      ...summarize(list, now),
    };
  });
  // Soonest departure first; vessels without a published departure last.
  vessels.sort((a, b) => time(a.etd) - time(b.etd) || a.vesselName.localeCompare(b.vesselName));
  return { vessels, unassigned };
}

export function groupByCarrier(bookings: TrackedBooking[], now: Date = new Date()): CarrierGroup[] {
  const byCarrier = new Map<string, TrackedBooking[]>();
  for (const b of bookings) byCarrier.set(b.carrierCode, [...(byCarrier.get(b.carrierCode) ?? []), b]);
  const groups: CarrierGroup[] = [...byCarrier.entries()].map(([carrierCode, list]) => ({
    carrierCode,
    vesselCount: new Set(list.map((b) => b.latest?.data?.vesselVisit?.id).filter(Boolean)).size,
    ...summarize(list, now),
  }));
  // Most urgent first: the carrier with the soonest upcoming cutoff, then by name.
  groups.sort((a, b) => time(a.nextCutoff?.at) - time(b.nextCutoff?.at) || a.carrierCode.localeCompare(b.carrierCode));
  return groups;
}
