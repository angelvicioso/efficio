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
  // ---- Extra port details (S-051 to S-059). For each: undefined = the port doesn't report it,
  // so it never raises an exception; null = reported as not set (e.g. VGM not submitted).
  /** Active holds, e.g. ["Customs exam"]. */
  holds?: string[];
  /** When the verified gross mass was submitted. */
  vgmVerifiedAt?: string | null;
  vgmKg?: number | null;
  /** The outbound vessel the terminal plans for this container; differs from the booking's when rolled. */
  plannedVessel?: { id: string; name: string | null } | null;
  /** Storage: end of free time at the terminal. */
  lastFreeDay?: string | null;
  dwellDays?: number | null;
  reefer?: { tempC: number | null; powered: boolean | null } | null;
  hazardous?: boolean | null;
  /** Trucking company that delivered it (or picked up the empty). */
  trucker?: string | null;
  /** Gate appointment for delivering it. */
  appointment?: { at: string; ref: string | null } | null;
  yardPosition?: string | null;
}

/** Vessel progress at the terminal (S-054). */
export interface VesselProgress {
  phase: string | null;
  arrivedAt: string | null;
  departedAt: string | null;
  berth: string | null;
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
  /**
   * The terminal's own running counts for the booking (N4 booking "tally" / "tallyReceive"),
   * used when individual container records are incomplete.
   */
  tally?: { emptiesOut: number; loadsIn: number };
  vesselProgress?: VesselProgress;
  /** Late-gate arrangements the terminal lists for this vessel (S-053), as readable lines. */
  lateGate?: string[];
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
  // Current ISO 6346 codes
  "22G0": "20' standard",
  "22G1": "20' standard",
  "42G0": "40' standard",
  "42G1": "40' standard",
  "45G0": "40' high cube",
  "45G1": "40' high cube",
  "22R1": "20' reefer",
  "42R1": "40' reefer",
  "45R1": "40' high cube reefer",
  "22U1": "20' open top",
  "42U1": "40' open top",
  "22P1": "20' flat rack",
  "42P1": "40' flat rack",
  "22T0": "20' tank",
  // Older ISO codes, still used by Port Houston (e.g. "2210" seen 2026-11-26)
  "2200": "20' standard",
  "2210": "20' standard",
  "4200": "40' standard",
  "4310": "40' standard",
  "4500": "40' high cube",
  "4510": "40' high cube",
  "2232": "20' reefer",
  "4332": "40' reefer",
  "4532": "40' high cube reefer",
  "2251": "20' open top",
  "4351": "40' open top",
};

export function sizeTypeLabel(code: string): string {
  return SIZE_TYPE_LABELS[code] ?? code;
}

export const CONTAINER_STAGE_LABELS: Record<ContainerStage, string> = {
  EMPTY_PICKED_UP: "Empty picked up",
  FULL_AT_TERMINAL: "Loaded, at terminal",
  LOADED_ON_VESSEL: "On vessel",
};

/** N4 vessel visit phases, in plain words. */
export function vesselPhaseLabel(phase: string | null | undefined): string | null {
  if (!phase) return null;
  const map: Record<string, string> = {
    "10CREATED": "Scheduled",
    "20INBOUND": "Inbound",
    "30ARRIVED": "Arrived",
    "40WORKING": "Working (loading/discharging)",
    "50COMPLETE": "Work complete",
    "60DEPARTED": "Departed",
    "70CLOSED": "Closed",
    "80CANCELED": "Canceled",
  };
  return map[phase.toUpperCase()] ?? phase;
}
