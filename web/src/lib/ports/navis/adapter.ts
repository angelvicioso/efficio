import type { BookingRef, PortAdapter } from "../adapter";
import type { Container, ContainerStage, EquipmentLine, PortBookingSnapshot } from "@/lib/domain/types";
import { EvpClient } from "./evpClient";
import { fetchVesselVisit, lineDates, terminalFor, toIso, type LineDates } from "./vesselVisits";

/**
 * Live Port Houston adapter over the Navis N4 EVP API (D-010, D-016), built from the field
 * names in Port Houston's real responses (2026-11-25 connection check).
 *
 * Safety (R-017): N4 returns every company's records. Every list below is filtered to an EXACT
 * match on this booking (number + carrier) before anything is kept, and the snapshot's `raw`
 * is a trimmed copy without shipper, consignee or trucker details.
 *
 * Still to confirm with a real booking (the "Test a booking" check on the admin page):
 * that the predicates nbr= / departOrderNbr= / eqoNbr= filter server-side, the gate subType
 * codes, and how often booking.visit is filled in.
 */

type N4Date = number | string | null | undefined;

interface N4BookingItem {
  eqSize?: string | null;
  eqHeight?: string | null;
  eqIsoGroup?: string | null;
  qty?: number | null;
  tally?: number | null;
  sampleEquipTypeId?: string | null;
}

export interface N4Booking {
  nbr?: string | null;
  lineId?: string | null;
  lineScac?: string | null;
  category?: string | null;
  quantity?: number | null;
  tally?: number | null;
  tallyReceive?: number | null;
  pod1Id?: string | null;
  polId?: string | null;
  visit?: { visitId?: string | null; facilityId?: string | null; erd?: N4Date; etd?: N4Date; eta?: N4Date } | null;
  timeEmptyPickup?: N4Date;
  timeBeginReceive?: N4Date;
  timeCargoCutoff?: N4Date;
  timeReeferCutoff?: N4Date;
  timeHazCutoff?: N4Date;
  items?: N4BookingItem[] | null;
  [key: string]: unknown;
}

export interface N4Unit {
  impediments?: { impedimentRoad?: string | null; impedimentVessel?: string | null; impedimentRail?: string | null } | null;
  stopFlags?: { stoppedRoad?: boolean | null; stoppedVessel?: boolean | null; stoppedRail?: boolean | null } | null;
  vgmVerifiedDate?: N4Date;
  contents?: { goodsAndCtrWtKgVerifiedGross?: number | null } | null;
  actualObCvId?: string | null;
  lastFreeDay?: N4Date;
  ufvBilling?: { lastFreeDay?: N4Date; lineLastFreeDay?: N4Date } | null;
  extras?: { dwellDays?: number | null } | null;
  requiresPower?: boolean | null;
  reefer?: { isPowered?: boolean | null; reeferRequirement?: { rfreqTempRequiredC?: number | null } | null } | null;
  isHazardous?: boolean | null;
  lastKnownPosition?: { posName?: string | null } | null;
  unitId?: string | null;
  freightKind?: string | null;
  category?: string | null;
  transitState?: string | null;
  departOrderNbr?: string | null;
  line?: string | null;
  eqtypeId?: string | null;
  intendedObCvId?: string | null;
  timestamps?: { timeIn?: N4Date; timeOfLoading?: N4Date; timeOut?: N4Date } | null;
  [key: string]: unknown;
}

export interface N4GateTransaction {
  subType?: string | null;
  status?: string | null;
  ctrId?: string | null;
  ctrFreightKind?: string | null;
  ctrTypeId?: string | null;
  eqoNbr?: string | null;
  lineId?: string | null;
  trkcoId?: string | null;
  created?: N4Date;
  handled?: N4Date;
  [key: string]: unknown;
}

/** One step of a lookup, for the admin "Test a booking" check. */
export type TraceFn = (line: string) => void;

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toUpperCase() === b.trim().toUpperCase();

/** N4 unit transit states, in order. S60+ means loaded on the vessel (or gone with it). */
function stageFromTransit(transitState: string | null | undefined): ContainerStage | null {
  const n = Number(/^S(\d{2})/.exec(transitState ?? "")?.[1]);
  if (!n) return null;
  if (n >= 60) return "LOADED_ON_VESSEL";
  if (n >= 30) return "FULL_AT_TERMINAL";
  return null;
}

/** Gate move direction. N4 subtypes: "DM" = deliver empty (empty out), "RE" = receive export (full in). */
function gateMove(t: N4GateTransaction): "EMPTY_OUT" | "FULL_IN" | null {
  const sub = (t.subType ?? "").trim().toUpperCase();
  if (sub === "DM") return "EMPTY_OUT";
  if (sub === "RE") return "FULL_IN";
  return null;
}

/** Merge unit records and gate moves into one container list for the booking. */
export function buildContainers(units: N4Unit[], gates: N4GateTransaction[]): Container[] {
  const byId = new Map<string, Container>();
  const get = (id: string, sizeType: string | null | undefined): Container => {
    let c = byId.get(id);
    if (!c) {
      c = { number: id, sizeType: sizeType ?? "", stage: "EMPTY_PICKED_UP", emptyPickedUpAt: null, fullGateInAt: null, loadedAt: null };
      byId.set(id, c);
    }
    if (!c.sizeType && sizeType) c.sizeType = sizeType;
    return c;
  };
  const RANK: Record<ContainerStage, number> = { EMPTY_PICKED_UP: 1, FULL_AT_TERMINAL: 2, LOADED_ON_VESSEL: 3 };
  const raise = (c: Container, stage: ContainerStage) => {
    if (RANK[stage] > RANK[c.stage]) c.stage = stage;
  };

  for (const g of gates) {
    if (!g.ctrId || (g.status && g.status.toUpperCase() === "CANCEL")) continue;
    const move = gateMove(g);
    if (!move) continue;
    const c = get(g.ctrId.trim(), g.ctrTypeId);
    const at = toIso(g.handled) ?? toIso(g.created);
    if (g.trkcoId?.trim()) c.trucker = g.trkcoId.trim();
    if (move === "EMPTY_OUT") c.emptyPickedUpAt ??= at;
    if (move === "FULL_IN") {
      c.fullGateInAt ??= at;
      raise(c, "FULL_AT_TERMINAL");
    }
  }
  for (const u of units) {
    if (!u.unitId) continue;
    const c = get(u.unitId.trim(), u.eqtypeId);
    const stage = stageFromTransit(u.transitState);
    if (stage && (u.freightKind ?? "FCL").toUpperCase() !== "MTY") raise(c, stage);
    c.fullGateInAt ??= c.stage !== "EMPTY_PICKED_UP" ? toIso(u.timestamps?.timeIn) : null;
    if (c.stage === "LOADED_ON_VESSEL") c.loadedAt ??= toIso(u.timestamps?.timeOfLoading);
    Object.assign(c, unitDetails(u));
  }
  return [...byId.values()].sort((a, b) => a.number.localeCompare(b.number));
}

/**
 * Extra container details from an N4 unit (S-051 to S-059). A field is only set when the
 * unit record has it, so missing data never raises an exception (undefined = not reported).
 */
export function unitDetails(u: N4Unit): Partial<Container> {
  const d: Partial<Container> = {};
  if (u.impediments !== undefined || u.stopFlags !== undefined) {
    const holds = [u.impediments?.impedimentRoad, u.impediments?.impedimentVessel, u.impediments?.impedimentRail]
      .filter((h): h is string => typeof h === "string" && h.trim() !== "")
      .map((h) => h.trim());
    if (u.stopFlags?.stoppedVessel) holds.push("Stopped for vessel");
    if (u.stopFlags?.stoppedRoad) holds.push("Stopped for road");
    d.holds = [...new Set(holds)];
  }
  if ("vgmVerifiedDate" in u) d.vgmVerifiedAt = toIso(u.vgmVerifiedDate);
  if (u.contents && "goodsAndCtrWtKgVerifiedGross" in u.contents) d.vgmKg = u.contents.goodsAndCtrWtKgVerifiedGross ?? null;
  const planned = u.intendedObCvId?.trim() || u.actualObCvId?.trim();
  if (planned) d.plannedVessel = { id: planned, name: null };
  if (u.ufvBilling || "lastFreeDay" in u) d.lastFreeDay = toIso(u.ufvBilling?.lastFreeDay) ?? toIso(u.lastFreeDay) ?? toIso(u.ufvBilling?.lineLastFreeDay);
  if (typeof u.extras?.dwellDays === "number") d.dwellDays = u.extras.dwellDays;
  if ("requiresPower" in u) {
    d.reefer = u.requiresPower ? { tempC: u.reefer?.reeferRequirement?.rfreqTempRequiredC ?? null, powered: u.reefer?.isPowered ?? null } : null;
  }
  if ("isHazardous" in u) d.hazardous = u.isHazardous ?? null;
  if (u.lastKnownPosition?.posName) d.yardPosition = u.lastKnownPosition.posName.trim();
  return d;
}

/** Late-gate arrangements on a vessel visit, as readable lines (structure unconfirmed; S-053). */
export function lateGateLines(visit: Record<string, unknown> | null): string[] | undefined {
  const list = visit?.lateArrivals;
  if (!Array.isArray(list)) return undefined;
  return list.map((entry) => {
    if (typeof entry !== "object" || entry === null) return String(entry);
    return Object.entries(entry as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
      .map(([k, v]) => `${k}: ${typeof v === "number" && v > 1e11 ? toIso(v) : String(v)}`)
      .join(", ");
  });
}

/** What was booked: per container type from items[], or the booking's overall quantity if items are missing. */
export function equipmentOf(b: N4Booking): EquipmentLine[] {
  const lines = (b.items ?? [])
    .filter((i) => (i.qty ?? 0) > 0)
    .map((i) => ({
      sizeType: i.sampleEquipTypeId?.trim() || [i.eqSize, i.eqHeight, i.eqIsoGroup].filter(Boolean).join(" "),
      quantity: i.qty ?? 0,
    }));
  const itemTotal = lines.reduce((n, l) => n + l.quantity, 0);
  const total = b.quantity ?? 0;
  // Never under-count: if the booking's total is higher than its listed items, show the difference.
  if (total > itemTotal) lines.push({ sizeType: itemTotal ? "other" : "unspecified", quantity: total - itemTotal });
  return lines;
}

function firstBerth(berths: unknown): string | null {
  if (!Array.isArray(berths) || berths.length === 0) return null;
  const b = berths[0];
  if (typeof b === "string") return b;
  if (b && typeof b === "object") {
    const o = b as Record<string, unknown>;
    const v = o.berthId ?? o.berthName ?? o.name ?? o.id;
    return typeof v === "string" ? v : null;
  }
  return null;
}

/** A trimmed copy of what the port sent: booking and vessel facts only, no other parties' details. */
function trimmedRaw(b: N4Booking, visit: Record<string, unknown> | null, units: N4Unit[], gates: N4GateTransaction[]) {
  const pick = <T extends object>(o: T | null | undefined, keys: string[]) =>
    o ? Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, (o as Record<string, unknown>)[k]])) : null;
  return {
    source: "Port Houston (Navis N4)",
    booking: pick(b, ["nbr", "lineId", "lineScac", "category", "quantity", "tally", "tallyReceive", "polId", "pod1Id", "eqStatus", "visit", "timeEmptyPickup", "timeBeginReceive", "timeCargoCutoff", "timeReeferCutoff", "timeHazCutoff", "items"]),
    vesselVisit: pick(visit, ["visitId", "vesName", "facility", "visitPhase", "obVyg", "beginReceive", "cargoCutoff", "reeferCutoff", "hazCutoff", "emptyPickup", "publishedEta", "publishedEtd", "eta", "etd", "ata", "atd", "berths", "lateArrivals", "lines"]),
    containers: units.map((u) =>
      pick(u, ["unitId", "freightKind", "transitState", "eqtypeId", "intendedObCvId", "actualObCvId", "timestamps", "impediments", "stopFlags", "vgmVerifiedDate", "lastFreeDay", "ufvBilling", "requiresPower", "isHazardous", "lastKnownPosition"]),
    ),
    gateMoves: gates.map((g) => pick(g, ["subType", "status", "ctrId", "ctrFreightKind", "ctrTypeId", "trkcoId", "created", "handled"])),
  };
}

export class NavisPortHoustonAdapter implements PortAdapter {
  readonly source = "navis-evp";
  readonly displayName = "Port Houston (live, Navis N4)";

  constructor(private readonly client: EvpClient = EvpClient.fromEnv()) {}

  async findCarriers(bookingNumber: string): Promise<string[]> {
    const number = bookingNumber.trim().toUpperCase();
    const found = await this.client.query<N4Booking>("orders/bookings", { predicate: `nbr=${number}`, maxPages: 1 });
    const scacs = found.filter((b) => same(b.nbr, number) && b.lineScac).map((b) => b.lineScac!.trim().toUpperCase());
    return [...new Set(scacs)];
  }

  async lookupBooking(ref: BookingRef, trace: TraceFn = () => {}): Promise<PortBookingSnapshot> {
    const bookingNumber = ref.bookingNumber.trim().toUpperCase();
    const scac = ref.carrierCode.trim().toUpperCase();
    const fetchedAt = new Date().toISOString();

    // 1. The booking: exact number AND carrier (SCAC), never "close enough".
    const candidates = await this.client.query<N4Booking>("orders/bookings", { predicate: `nbr=${bookingNumber}`, maxPages: 1 });
    const sameNumber = candidates.filter((b) => same(b.nbr, bookingNumber));
    const booking = sameNumber.find((b) => same(b.lineScac, scac));
    trace(
      `Booking: ${candidates.length} record(s) returned for the filter, ${sameNumber.length} with this exact number, ` +
        `${booking ? "1 with this carrier ✓" : "none with this carrier ✗"}` +
        (candidates.length > sameNumber.length ? " (the filter didn't narrow results server-side; extras ignored)" : ""),
    );
    if (!booking) {
      return {
        source: this.source,
        bookingNumber,
        onFile: false,
        terminal: null,
        carrierCode: scac,
        vesselVisit: null,
        receivingOpensAt: null,
        cutoffs: [],
        raw: { source: "Port Houston (Navis N4)", found: false, sameNumberOtherCarrier: sameNumber.length > 0 },
        fetchedAt,
      };
    }

    // 2. Its vessel visit, for the receiving window and cutoffs.
    let dates: LineDates | null = null;
    let visitRaw: Record<string, unknown> | null = null;
    const visitId = booking.visit?.visitId?.trim();
    if (visitId) {
      try {
        const visit = await fetchVesselVisit(this.client, visitId);
        if (visit) {
          visitRaw = visit;
          dates = lineDates(visit, booking.lineId);
        }
        trace(`Vessel visit ${visit ? "found ✓" : "not found ✗"} (booking points to a vessel)`);
      } catch (e) {
        trace(`Vessel visit lookup failed ✗: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      trace("Vessel visit: the booking isn't linked to a vessel yet");
    }

    // Booking-level dates override the vessel's when the terminal sets them on the booking.
    const receivingOpensAt = toIso(booking.timeBeginReceive) ?? dates?.receivingOpensAt ?? toIso(booking.visit?.erd) ?? null;
    const cutoffs = [...(dates?.cutoffs ?? [])];
    const override = (kind: "cargo" | "reefer" | "hazmat", v: N4Date) => {
      const at = toIso(v);
      if (!at) return;
      const i = cutoffs.findIndex((c) => c.kind === kind);
      if (i >= 0) cutoffs[i] = { kind, at, setBy: "terminal" };
      else cutoffs.push({ kind, at, setBy: "terminal" });
    };
    override("cargo", booking.timeCargoCutoff);
    override("reefer", booking.timeReeferCutoff);
    override("hazmat", booking.timeHazCutoff);
    trace(`Dates: receiving opens ${receivingOpensAt ? "✓" : "✗"}, cargo cutoff ${cutoffs.some((c) => c.kind === "cargo") ? "✓" : "✗"}`);

    // 3. Its containers: unit records and gate moves, exact booking number (and line) only.
    let units: N4Unit[] = [];
    let gates: N4GateTransaction[] = [];
    try {
      const all = await this.client.query<N4Unit>("inventory/units", { predicate: `departOrderNbr=${bookingNumber}`, maxPages: 1 });
      units = all.filter((u) => same(u.departOrderNbr, bookingNumber) && (!u.line || !booking.lineId || same(u.line, booking.lineId)));
      trace(`Containers (units): ${all.length} returned, ${units.length} on this booking`);
    } catch (e) {
      trace(`Containers (units) lookup failed ✗: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      const all = await this.client.query<N4GateTransaction>("road/gatetransactions", { predicate: `eqoNbr=${bookingNumber}`, maxPages: 2 });
      gates = all.filter((g) => same(g.eqoNbr, bookingNumber) && (!g.lineId || !booking.lineId || same(g.lineId, booking.lineId)));
      const kinds = [...new Set(gates.map((g) => g.subType ?? "?"))].join(", ") || "none";
      trace(`Gate moves: ${all.length} returned, ${gates.length} on this booking (types: ${kinds})`);
    } catch (e) {
      trace(`Gate moves lookup failed ✗: ${e instanceof Error ? e.message : String(e)}`);
    }
    const containers = buildContainers(units, gates);

    return {
      source: this.source,
      bookingNumber,
      onFile: true,
      terminal: dates?.terminal ?? terminalFor(booking.visit?.facilityId),
      carrierCode: scac,
      vesselVisit: dates?.vesselVisit ?? null,
      receivingOpensAt,
      cutoffs,
      equipment: equipmentOf(booking),
      containers,
      tally: { emptiesOut: booking.tally ?? 0, loadsIn: booking.tallyReceive ?? 0 },
      ...(visitRaw
        ? {
            vesselProgress: {
              phase: typeof visitRaw.visitPhase === "string" ? visitRaw.visitPhase : null,
              arrivedAt: toIso(visitRaw.ata as N4Date),
              departedAt: toIso(visitRaw.atd as N4Date),
              berth: firstBerth(visitRaw.berths),
            },
            lateGate: lateGateLines(visitRaw),
          }
        : {}),
      raw: trimmedRaw(booking, visitRaw, units, gates),
      fetchedAt,
    };
  }
}
