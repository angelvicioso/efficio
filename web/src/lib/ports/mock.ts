import type { BookingRef, PortAdapter } from "./adapter";
import type { Container, EquipmentLine, PortBookingSnapshot, Terminal } from "@/lib/domain/types";
import { containerCheckDigit } from "@/lib/domain/containers";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface Scenario {
  description: string;
  terminal: Terminal;
  carrierCode: string;
  /** The vessel call; bookings with the same visitId are on the same vessel. */
  visitId: string;
  vesselName: string;
  /** This carrier's voyage number on the vessel. */
  voyage: string;
  /** Offsets from "now", in ms. */
  opensIn: number;
  cargoCutoffIn: number;
  etdIn: number;
  /** What was booked, and how far along the containers are (S-041). */
  equipment: EquipmentLine[];
  pickedUp: number;
  delivered: number;
  loaded?: number;
}

/**
 * Simulated Port Houston data for building and demos until live access is confirmed (S-011).
 * Every date is relative to the current time so each scenario always shows its state.
 * NOTE: the `raw` shape below is Efficio's own placeholder, NOT the real Navis N4 format.
 */
export const MOCK_SCENARIOS: Record<string, Scenario> = {
  HOU1001: { description: "Receiving not open yet", terminal: "BAYPORT", carrierCode: "MSCU", visitId: "MSCAUR548", vesselName: "MSC AURORA", voyage: "FA548W", opensIn: 2 * DAY + 5 * HOUR, cargoCutoffIn: 6 * DAY, etdIn: 8 * DAY, equipment: [{ sizeType: "45G1", quantity: 3 }], pickedUp: 1, delivered: 0 },
  HOU1002: { description: "Receiving open", terminal: "BAYPORT", carrierCode: "MAEU", visitId: "MAEHOU247", vesselName: "MAERSK HOUSTON", voyage: "247E", opensIn: -1 * DAY, cargoCutoffIn: 4 * DAY + 3 * HOUR, etdIn: 6 * DAY, equipment: [{ sizeType: "45G1", quantity: 4 }], pickedUp: 4, delivered: 2 },
  HOU1003: { description: "Closing soon", terminal: "BARBOURS_CUT", carrierCode: "HLCU", visitId: "HAMEXP033", vesselName: "HAMBURG EXPRESS", voyage: "033W", opensIn: -4 * DAY, cargoCutoffIn: 20 * HOUR, etdIn: 2 * DAY, equipment: [{ sizeType: "22G1", quantity: 2 }], pickedUp: 2, delivered: 1 },
  HOU1004: { description: "Receiving closed", terminal: "BAYPORT", carrierCode: "CMDU", visitId: "CMATEX0FL", vesselName: "CMA CGM TEXAS", voyage: "0FL3SW1MA", opensIn: -7 * DAY, cargoCutoffIn: -1 * DAY, etdIn: 1 * DAY, equipment: [{ sizeType: "45G1", quantity: 5 }], pickedUp: 5, delivered: 5, loaded: 3 },
  HOU1005: { description: "Cutoff moves earlier on each refresh", terminal: "BAYPORT", carrierCode: "ONEY", visitId: "ONEGUL012", vesselName: "ONE GULF", voyage: "012W", opensIn: -2 * DAY, cargoCutoffIn: 5 * DAY, etdIn: 7 * DAY, equipment: [{ sizeType: "45R1", quantity: 2 }], pickedUp: 1, delivered: 0 },
  // More bookings on MAERSK HOUSTON, for the vessel view (S-040). HOU1007 is an MSC booking on the
  // same ship (carriers share vessels in alliances), with MSC's own voyage number and cutoff.
  HOU1006: { description: "Another booking on MAERSK HOUSTON", terminal: "BAYPORT", carrierCode: "MAEU", visitId: "MAEHOU247", vesselName: "MAERSK HOUSTON", voyage: "247E", opensIn: -1 * DAY, cargoCutoffIn: 4 * DAY + 3 * HOUR, etdIn: 6 * DAY, equipment: [{ sizeType: "45G1", quantity: 6 }], pickedUp: 3, delivered: 1 },
  HOU1007: { description: "MSC booking on MAERSK HOUSTON", terminal: "BAYPORT", carrierCode: "MSCU", visitId: "MAEHOU247", vesselName: "MAERSK HOUSTON", voyage: "FX247E", opensIn: -1 * DAY, cargoCutoffIn: 3 * DAY + 15 * HOUR, etdIn: 6 * DAY, equipment: [{ sizeType: "22G1", quantity: 2 }, { sizeType: "45G1", quantity: 1 }], pickedUp: 3, delivered: 3 },
};

/**
 * Any booking number not listed above, or listed under a different carrier, is "not on file",
 * like a booking the carrier hasn't sent yet or one entered with the wrong carrier.
 */
export class MockPortHoustonAdapter implements PortAdapter {
  readonly source = "mock";
  readonly displayName = "Port Houston (simulated)";
  private lookups = new Map<string, number>();
  /**
   * Dates are anchored to the first lookup of any booking on the same vessel (rounded to the hour),
   * so refreshes are stable and every booking on a vessel shares one schedule.
   */
  private anchors = new Map<string, number>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async lookupBooking(ref: BookingRef): Promise<PortBookingSnapshot> {
    const key = ref.bookingNumber.trim().toUpperCase();
    const carrierCode = ref.carrierCode.trim().toUpperCase();
    const fetchedAt = this.now();
    const listed = MOCK_SCENARIOS[key];
    const scenario = listed && listed.carrierCode === carrierCode ? listed : undefined;
    const count = (this.lookups.get(key) ?? 0) + 1;
    this.lookups.set(key, count);

    if (!scenario) {
      return {
        source: this.source,
        bookingNumber: key,
        onFile: false,
        terminal: null,
        carrierCode,
        vesselVisit: null,
        receivingOpensAt: null,
        cutoffs: [],
        raw: { mock: true, bookingNumber: key, line: carrierCode, found: false },
        fetchedAt: fetchedAt.toISOString(),
      };
    }

    let t = this.anchors.get(scenario.visitId);
    if (t === undefined) {
      t = Math.floor(fetchedAt.getTime() / HOUR) * HOUR;
      this.anchors.set(scenario.visitId, t);
    }
    // HOU1005 demonstrates change detection (S-020): the cutoff moves 12h earlier on each of the
    // next two lookups, then settles (so frequent automatic refreshes don't push it into the past).
    const drift = key === "HOU1005" ? Math.min(count - 1, 2) * 12 * HOUR : 0;
    const anchor = t;
    const at = (offset: number) => new Date(anchor + offset).toISOString();
    const cargoCutoff = at(scenario.cargoCutoffIn - drift);

    return {
      source: this.source,
      bookingNumber: key,
      onFile: true,
      terminal: scenario.terminal,
      carrierCode: scenario.carrierCode,
      vesselVisit: {
        id: scenario.visitId,
        vesselName: scenario.vesselName,
        voyage: scenario.voyage,
        eta: at(scenario.etdIn - 1 * DAY),
        etd: at(scenario.etdIn),
      },
      receivingOpensAt: at(scenario.opensIn),
      cutoffs: [
        { kind: "cargo", at: cargoCutoff, setBy: "terminal" },
        { kind: "reefer", at: cargoCutoff, setBy: "terminal" },
        { kind: "hazmat", at: at(scenario.cargoCutoffIn - drift - 1 * DAY), setBy: "terminal" },
      ],
      equipment: scenario.equipment,
      containers: mockContainers(key, scenario, anchor),
      raw: {
        mock: true,
        scenario: scenario.description,
        equipment: scenario.equipment,
        booking: { number: key, line: scenario.carrierCode, facility: scenario.terminal },
        vesselVisit: { vessel: scenario.vesselName, voyage: scenario.voyage, beginReceive: at(scenario.opensIn), cargoCutoff },
      },
      fetchedAt: fetchedAt.toISOString(),
    };
  }
}

/** Container owner prefixes for the simulated carriers. */
const OWNER_PREFIX: Record<string, string> = { MAEU: "MSKU", MSCU: "MSCU", HLCU: "HLXU", CMDU: "CMAU", ONEY: "ONEU" };

/** Stable pseudo-random 6-digit serial from a string. */
function serial(seed: string): string {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return String(h % 1_000_000).padStart(6, "0");
}

/**
 * Simulated containers: the first `pickedUp` are out, the first `delivered` of those are back full
 * at the terminal, the first `loaded` are on the vessel. All event times are in the past.
 */
function mockContainers(bookingNumber: string, s: Scenario, anchor: number): Container[] {
  const types = s.equipment.flatMap((e) => Array.from({ length: e.quantity }, () => e.sizeType));
  const prefix = OWNER_PREFIX[s.carrierCode] ?? "XXXU";
  const opened = anchor + s.opensIn;
  return types.slice(0, s.pickedUp).map((sizeType, i) => {
    const first10 = `${prefix}${serial(`${bookingNumber}-${i}`)}`;
    const delivered = i < s.delivered;
    const loaded = i < (s.loaded ?? 0);
    // Spread events over the past: pickups ~1-3 days ago, gate-ins after the window opened.
    const pickup = anchor - (3 * DAY - i * 7 * HOUR);
    const gateIn = Math.max(opened + 2 * HOUR, pickup + 10 * HOUR) + i * HOUR;
    return {
      number: `${first10}${containerCheckDigit(first10)}`,
      sizeType,
      stage: loaded ? "LOADED_ON_VESSEL" : delivered ? "FULL_AT_TERMINAL" : "EMPTY_PICKED_UP",
      emptyPickedUpAt: new Date(pickup).toISOString(),
      fullGateInAt: delivered ? new Date(Math.min(gateIn, anchor - HOUR)).toISOString() : null,
      loadedAt: loaded ? new Date(anchor - 2 * HOUR + i * 10 * 60_000).toISOString() : null,
    };
  });
}
