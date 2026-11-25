import type { TrackedBooking } from "@/lib/bookings";
import { cargoCutoff, receivingStatus, type ReceivingState } from "./status";
import type { Terminal } from "./types";

/** The viewer's bookings on one vessel call (S-040). */
export interface VesselGroup {
  visitId: string;
  vesselName: string;
  terminal: Terminal | null;
  eta: string | null;
  etd: string | null;
  /** Sorted by cargo cutoff, earliest first (cutoffs can differ by carrier on the same vessel). */
  bookings: TrackedBooking[];
  /** The booking whose cargo cutoff comes next (not yet passed), if any. */
  nextCutoff: { booking: TrackedBooking; at: string } | null;
  /** How many bookings are in each receiving state. */
  stateCounts: Partial<Record<ReceivingState, number>>;
}

export interface VesselGrouping {
  vessels: VesselGroup[];
  /** Bookings the terminal hasn't linked to a vessel yet (not on file, or no data). */
  unassigned: TrackedBooking[];
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY);

export function groupByVessel(bookings: TrackedBooking[], now: Date = new Date()): VesselGrouping {
  const groups = new Map<string, VesselGroup>();
  const unassigned: TrackedBooking[] = [];

  for (const b of bookings) {
    const snap = b.latest?.data;
    const visit = snap?.onFile ? snap.vesselVisit : null;
    if (!snap || !visit?.id) {
      unassigned.push(b);
      continue;
    }
    let g = groups.get(visit.id);
    if (!g) {
      g = {
        visitId: visit.id,
        vesselName: visit.vesselName,
        terminal: snap.terminal,
        eta: visit.eta,
        etd: visit.etd,
        bookings: [],
        nextCutoff: null,
        stateCounts: {},
      };
      groups.set(visit.id, g);
    }
    g.bookings.push(b);
    const state = receivingStatus(snap, now).state;
    g.stateCounts[state] = (g.stateCounts[state] ?? 0) + 1;
    const cutoff = cargoCutoff(snap);
    if (cutoff && Date.parse(cutoff) > now.getTime() && (!g.nextCutoff || Date.parse(cutoff) < Date.parse(g.nextCutoff.at))) {
      g.nextCutoff = { booking: b, at: cutoff };
    }
  }

  const vessels = [...groups.values()];
  for (const g of vessels) {
    g.bookings.sort((a, b) => time(cargoCutoff(a.latest!.data!)) - time(cargoCutoff(b.latest!.data!)));
  }
  // Soonest departure first; vessels without a published departure last.
  vessels.sort((a, b) => time(a.etd) - time(b.etd) || a.vesselName.localeCompare(b.vesselName));
  return { vessels, unassigned };
}
