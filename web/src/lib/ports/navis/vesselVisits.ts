import type { Cutoff, Terminal, VesselVisit } from "@/lib/domain/types";
import type { EvpClient } from "./evpClient";

/**
 * Navis N4 vessel visits (GET /vessel/vesselvisits), mapped from the field names seen in
 * Port Houston's real responses (2026-11-25 connection check):
 *  - dates are numbers (epoch milliseconds), on the visit itself and per line operator in lines[]
 *  - lines[].lineId / visit lineId are Port Houston's 3-letter line codes (not SCAC)
 *  - facility is the terminal; vesName can have trailing spaces
 */

type N4Date = number | string | null | undefined;

export interface N4VesselVisitLine {
  lineId?: string | null;
  lineInVoyNbr?: string | null;
  lineOutVoyNbr?: string | null;
  beginReceive?: N4Date;
  cargoCutoff?: N4Date;
  reeferCutoff?: N4Date;
  hazCutoff?: N4Date;
  emptyPickup?: N4Date;
}

export interface N4VesselVisit extends Omit<N4VesselVisitLine, "lineInVoyNbr" | "lineOutVoyNbr"> {
  visitId?: string | null;
  vesName?: string | null;
  visitPhase?: string | null;
  facility?: string | null;
  obVyg?: string | null;
  publishedEta?: N4Date;
  publishedEtd?: N4Date;
  eta?: N4Date;
  etd?: N4Date;
  lines?: N4VesselVisitLine[] | null;
  [key: string]: unknown;
}

export interface LineDates {
  vesselVisit: VesselVisit;
  terminal: Terminal | null;
  receivingOpensAt: string | null;
  emptyPickupAt: string | null;
  cutoffs: Cutoff[];
}

/**
 * N4 dates arrive as epoch numbers (milliseconds; seconds handled too) or ISO text.
 * Anything unreadable becomes null rather than a wrong date.
 */
export function toIso(value: N4Date): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    const ms = value < 1e11 ? value * 1000 : value; // 10-digit numbers are seconds
    return new Date(ms).toISOString();
  }
  if (/^\d{10,13}$/.test(value)) return toIso(Number(value));
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Port Houston facility codes. BPT is confirmed by the token scope (POHA_BPT_PROD); BCT is assumed. */
const FACILITIES: Record<string, Terminal> = { BPT: "BAYPORT", BCT: "BARBOURS_CUT" };

export function terminalFor(facility: string | null | undefined): Terminal | null {
  return facility ? (FACILITIES[facility.trim().toUpperCase()] ?? null) : null;
}

/**
 * Dates for one line operator on a vessel visit: the line's own dates where set, otherwise the
 * visit's (in real responses the per-line dates are often empty and the visit carries them).
 */
export function lineDates(visit: N4VesselVisit, lineId: string | null | undefined): LineDates {
  const line = lineId ? (visit.lines ?? []).find((l) => (l.lineId ?? "").trim().toUpperCase() === lineId.trim().toUpperCase()) : undefined;
  const pick = (k: "beginReceive" | "cargoCutoff" | "reeferCutoff" | "hazCutoff" | "emptyPickup") => toIso(line?.[k]) ?? toIso(visit[k]);
  const cutoffs: Cutoff[] = [];
  const add = (kind: Cutoff["kind"], at: string | null) => {
    if (at) cutoffs.push({ kind, at, setBy: "terminal" });
  };
  add("cargo", pick("cargoCutoff"));
  add("reefer", pick("reeferCutoff"));
  add("hazmat", pick("hazCutoff"));
  return {
    vesselVisit: {
      id: (visit.visitId ?? "").trim(),
      vesselName: (visit.vesName ?? "").trim() || (visit.visitId ?? "Unknown vessel"),
      voyage: line?.lineOutVoyNbr?.trim() || visit.obVyg?.trim() || null,
      eta: toIso(visit.publishedEta) ?? toIso(visit.eta),
      etd: toIso(visit.publishedEtd) ?? toIso(visit.etd),
    },
    terminal: terminalFor(visit.facility),
    receivingOpensAt: pick("beginReceive"),
    emptyPickupAt: pick("emptyPickup"),
    cutoffs,
  };
}

/** One vessel visit by its N4 visit ID; exact match only (never another visit from the page). */
export async function fetchVesselVisit(client: EvpClient, visitId: string): Promise<N4VesselVisit | null> {
  const visits = await client.query<N4VesselVisit>("vessel/vesselvisits", { predicate: `visitId=${visitId}`, maxPages: 1 });
  return visits.find((v) => (v.visitId ?? "").trim() === visitId.trim()) ?? null;
}
