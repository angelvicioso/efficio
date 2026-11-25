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

/**
 * Where a container is in the export flow (S-041). Each stage includes the ones before it:
 * a container loaded on the vessel was also picked up empty and delivered full.
 */
export type ContainerStage = "EMPTY_PICKED_UP" | "FULL_AT_TERMINAL" | "LOADED_ON_VESSEL";

export interface Container {
  /** ISO 6346 container number, e.g. MSKU1234565. */
  number: string;
  /** ISO size/type code, e.g. 45G1 (40' high cube). */
  sizeType: string;
  stage: ContainerStage;
  emptyPickedUpAt: string | null;
  fullGateInAt: string | null;
  loadedAt: string | null;
}

/** What was booked: e.g. 4 × 45G1. */
export interface EquipmentLine {
  sizeType: string;
  quantity: number;
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
  /** Containers booked, by size/type. Optional: older snapshots don't have it. */
  equipment?: EquipmentLine[];
  /** Containers the terminal knows for this booking (picked up empty or later). */
  containers?: Container[];
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

/** Friendly names for common ISO size/type codes. */
export const SIZE_TYPE_LABELS: Record<string, string> = {
  "22G1": "20' standard",
  "42G1": "40' standard",
  "45G1": "40' high cube",
  "45R1": "40' reefer",
  "22R1": "20' reefer",
};

export function sizeTypeLabel(code: string): string {
  return SIZE_TYPE_LABELS[code] ?? code;
}

export const CONTAINER_STAGE_LABELS: Record<ContainerStage, string> = {
  EMPTY_PICKED_UP: "Empty picked up",
  FULL_AT_TERMINAL: "Loaded, at terminal",
  LOADED_ON_VESSEL: "On vessel",
};
