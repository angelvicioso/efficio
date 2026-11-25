/**
 * Efficio's own data model for what a port/terminal reports about a booking.
 * Every port adapter translates its source format into this shape (D-003),
 * so the UI never depends on one terminal's field names.
 */

export type Terminal = "BAYPORT" | "BARBOURS_CUT";

/** Who sets a cutoff. Terminals set cargo/reefer/hazmat; carriers set documentation/VGM (Q-018). */
export type CutoffSetter = "terminal" | "carrier";

export type CutoffKind = "cargo" | "reefer" | "hazmat" | "documentation" | "vgm";

export interface Cutoff {
  kind: CutoffKind;
  /** ISO 8601 timestamp (UTC). */
  at: string;
  setBy: CutoffSetter;
}

export interface VesselVisit {
  /** The source system's identifier for this vessel call. */
  id: string;
  vesselName: string;
  voyage: string | null;
  eta: string | null;
  etd: string | null;
}

/** One reading of a booking from a port source at a point in time. */
export interface PortBookingSnapshot {
  source: string;
  bookingNumber: string;
  /** False when the terminal has no record of the booking yet (R-007). */
  onFile: boolean;
  terminal: Terminal | null;
  carrierCode: string | null;
  vesselVisit: VesselVisit | null;
  /** Earliest receiving date: when the receiving window opens. */
  receivingOpensAt: string | null;
  cutoffs: Cutoff[];
  /** The untranslated response, so exporters can see exactly what the port says (S-002). */
  raw: unknown;
  fetchedAt: string;
}

export const CUTOFF_LABELS: Record<CutoffKind, string> = {
  cargo: "Cargo (CY) cutoff",
  reefer: "Reefer cutoff",
  hazmat: "Hazmat cutoff",
  documentation: "Documentation cutoff",
  vgm: "VGM cutoff",
};

export const TERMINAL_LABELS: Record<Terminal, string> = {
  BAYPORT: "Bayport",
  BARBOURS_CUT: "Barbours Cut",
};
