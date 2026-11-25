import type { BookingRef, PortAdapter } from "./adapter";
import type { PortBookingSnapshot, Terminal } from "@/lib/domain/types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface Scenario {
  description: string;
  terminal: Terminal;
  carrierCode: string;
  vesselName: string;
  voyage: string;
  /** Offsets from "now", in ms. */
  opensIn: number;
  cargoCutoffIn: number;
  etdIn: number;
}

/**
 * Simulated Port Houston data for building and demos until live access is confirmed (S-011).
 * Every date is relative to the current time so each scenario always shows its state.
 * NOTE: the `raw` shape below is Efficio's own placeholder, NOT the real Navis N4 format.
 */
export const MOCK_SCENARIOS: Record<string, Scenario> = {
  HOU1001: { description: "Receiving not open yet", terminal: "BAYPORT", carrierCode: "MSCU", vesselName: "MSC AURORA", voyage: "FA548W", opensIn: 2 * DAY + 5 * HOUR, cargoCutoffIn: 6 * DAY, etdIn: 8 * DAY },
  HOU1002: { description: "Receiving open", terminal: "BAYPORT", carrierCode: "MAEU", vesselName: "MAERSK HOUSTON", voyage: "247E", opensIn: -1 * DAY, cargoCutoffIn: 4 * DAY + 3 * HOUR, etdIn: 6 * DAY },
  HOU1003: { description: "Closing soon", terminal: "BARBOURS_CUT", carrierCode: "HLCU", vesselName: "HAMBURG EXPRESS", voyage: "033W", opensIn: -4 * DAY, cargoCutoffIn: 20 * HOUR, etdIn: 2 * DAY },
  HOU1004: { description: "Receiving closed", terminal: "BAYPORT", carrierCode: "CMDU", vesselName: "CMA CGM TEXAS", voyage: "0FL3SW1MA", opensIn: -7 * DAY, cargoCutoffIn: -1 * DAY, etdIn: 1 * DAY },
  HOU1005: { description: "Cutoff moves earlier on each refresh", terminal: "BAYPORT", carrierCode: "ONEY", vesselName: "ONE GULF", voyage: "012W", opensIn: -2 * DAY, cargoCutoffIn: 5 * DAY, etdIn: 7 * DAY },
};

/**
 * Any booking number not listed above, or listed under a different carrier, is "not on file",
 * like a booking the carrier hasn't sent yet or one entered with the wrong carrier.
 */
export class MockPortHoustonAdapter implements PortAdapter {
  readonly source = "mock";
  readonly displayName = "Port Houston (simulated)";
  private lookups = new Map<string, number>();
  /** Each booking's dates are anchored to its first lookup (rounded to the hour) so refreshes are stable. */
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

    let t = this.anchors.get(key);
    if (t === undefined) {
      t = Math.floor(fetchedAt.getTime() / HOUR) * HOUR;
      this.anchors.set(key, t);
    }
    // HOU1005 demonstrates change detection (S-020): the cutoff moves 12h earlier per lookup.
    const drift = key === "HOU1005" ? (count - 1) * 12 * HOUR : 0;
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
        id: `${scenario.vesselName.replace(/\W/g, "").slice(0, 6)}-${scenario.voyage}`,
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
      raw: {
        mock: true,
        scenario: scenario.description,
        booking: { number: key, line: scenario.carrierCode, facility: scenario.terminal },
        vesselVisit: { vessel: scenario.vesselName, voyage: scenario.voyage, beginReceive: at(scenario.opensIn), cargoCutoff },
      },
      fetchedAt: fetchedAt.toISOString(),
    };
  }
}
