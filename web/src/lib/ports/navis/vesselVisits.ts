import type { Cutoff, VesselVisit } from "@/lib/domain/types";
import type { EvpClient } from "./evpClient";

/**
 * Navis N4 vessel visits (GET /vessel/vesselvisits), per the NSP API Developer Guide.
 *
 * The receiving window and cutoffs live on the vessel visit's `lines[]`: one entry per line
 * operator (carrier), each with its own dates. That's why a booking needs its carrier (D-015).
 *
 * Field names below come from the guide's sample payload. Date formats aren't shown there
 * (samples are null), so dates are parsed defensively and anything unreadable is dropped
 * rather than shown wrong. Confirm against a live response in spike S-013.
 */

export interface N4VesselVisitLine {
  lineId?: string | null;
  lineInVoyNbr?: string | null;
  lineOutVoyNbr?: string | null;
  beginReceive?: string | null;
  cargoCutoff?: string | null;
  reeferCutoff?: string | null;
  hazCutoff?: string | null;
  emptyPickup?: string | null;
}

export interface N4VesselVisit {
  visitId?: string | null;
  vesName?: string | null;
  visitPhase?: string | null;
  publishedEta?: string | null;
  publishedEtd?: string | null;
  lines?: N4VesselVisitLine[] | null;
  [key: string]: unknown;
}

/** Dates for one carrier on one vessel visit, in Efficio's model. */
export interface LineDates {
  vesselVisit: VesselVisit;
  receivingOpensAt: string | null;
  emptyPickupAt: string | null;
  cutoffs: Cutoff[];
}

export function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * The carrier's dates on a vessel visit. N4's `lineId` is the line operator code; whether
 * Port Houston uses SCAC codes (MAEU) there is unconfirmed, so callers pass the code to match.
 */
export function lineDates(visit: N4VesselVisit, lineId: string): LineDates | null {
  const line = (visit.lines ?? []).find((l) => (l.lineId ?? "").toUpperCase() === lineId.toUpperCase());
  if (!line) return null;
  const cutoffs: Cutoff[] = [];
  const add = (kind: Cutoff["kind"], value: string | null | undefined) => {
    const at = toIso(value);
    if (at) cutoffs.push({ kind, at, setBy: "terminal" });
  };
  add("cargo", line.cargoCutoff);
  add("reefer", line.reeferCutoff);
  add("hazmat", line.hazCutoff);
  return {
    vesselVisit: {
      id: visit.visitId ?? "",
      vesselName: visit.vesName ?? visit.visitId ?? "Unknown vessel",
      voyage: line.lineOutVoyNbr ?? null,
      eta: toIso(visit.publishedEta),
      etd: toIso(visit.publishedEtd),
    },
    receivingOpensAt: toIso(line.beginReceive),
    emptyPickupAt: toIso(line.emptyPickup),
    cutoffs,
  };
}

/** Look up one vessel visit by its N4 visit ID. */
export async function fetchVesselVisit(client: EvpClient, visitId: string): Promise<N4VesselVisit | null> {
  const visits = await client.query<N4VesselVisit>("vessel/vesselvisits", { predicate: `visitId=${visitId}`, maxPages: 1 });
  return visits[0] ?? null;
}
