import { describe, expect, it } from "vitest";
import { EvpClient } from "../ports/navis/evpClient";
import { NavisPortHoustonAdapter, buildContainers } from "../ports/navis/adapter";
import { containerProgress } from "../domain/containers";

const ms = (iso: string) => Date.parse(iso);

// Shapes from Port Houston's real responses (2026-11-25). Each list also contains OTHER companies'
// records, because N4 returns everyone's data: the adapter must keep only this booking's.
const BOOKINGS = [
  { nbr: "MAE1234567", lineId: "MAE", lineScac: "MAEU", category: "EXPRT", quantity: 4, tally: 3, tallyReceive: 2, shipperId: "ACME",
    visit: { visitId: "MHOU", facilityId: "BPT" }, timeCargoCutoff: null,
    items: [{ eqSize: "NOM40", eqHeight: "NOM96", eqIsoGroup: "GP", qty: 4, sampleEquipTypeId: "45G1" }] },
  { nbr: "MAE1234567", lineId: "MSC", lineScac: "MSCU", quantity: 9 }, // same number, other carrier
  { nbr: "OTHER00001", lineId: "MAE", lineScac: "MAEU", quantity: 50, shipperId: "COMPETITOR" },
];
const VISITS = [
  { visitId: "MHOU", vesName: "MAERSK HOUSTON ", facility: "BPT", obVyg: "247", beginReceive: ms("2026-11-23T20:00:00Z"),
    cargoCutoff: ms("2026-11-28T23:00:00Z"), hazCutoff: ms("2026-11-27T23:00:00Z"), lines: [{ lineId: "MAE", lineOutVoyNbr: "247E" }] },
  { visitId: "XXXX", vesName: "SOMEONE ELSE" },
];
const UNITS = [
  { unitId: "MSKU1111111", departOrderNbr: "MAE1234567", line: "MAE", freightKind: "FCL", transitState: "S60_LOADED", eqtypeId: "4500",
    timestamps: { timeIn: ms("2026-11-24T10:00:00Z"), timeOfLoading: ms("2026-11-25T08:00:00Z") } },
  { unitId: "MSKU2222222", departOrderNbr: "MAE1234567", line: "MAE", freightKind: "FCL", transitState: "S40_YARD", timestamps: { timeIn: ms("2026-11-24T12:00:00Z") } },
  { unitId: "CMPT9999999", departOrderNbr: "OTHER00001", line: "MAE", freightKind: "FCL", transitState: "S40_YARD" },
];
const GATES = [
  { subType: "DM", status: "COMPLETE", ctrId: "MSKU1111111", eqoNbr: "MAE1234567", lineId: "MAE", handled: ms("2026-11-22T09:00:00Z"), shipper: "ACME, INC." },
  { subType: "DM", status: "COMPLETE", ctrId: "MSKU2222222", eqoNbr: "MAE1234567", lineId: "MAE", handled: ms("2026-11-22T11:00:00Z"), shipper: "ACME, INC." },
  { subType: "DM", status: "COMPLETE", ctrId: "MSKU3333333", eqoNbr: "MAE1234567", lineId: "MAE", handled: ms("2026-11-23T11:00:00Z"), shipper: "ACME, INC." },
  { subType: "RE", status: "COMPLETE", ctrId: "MSKU1111111", eqoNbr: "MAE1234567", lineId: "MAE", handled: ms("2026-11-24T10:00:00Z"), shipper: "ACME, INC." },
  { subType: "RE", status: "COMPLETE", ctrId: "CMPT9999999", eqoNbr: "OTHER00001", lineId: "MAE", shipper: "COMPETITOR LLC" },
];

/** A fake N4 that, like a careless API, ignores filters and returns everyone's records. */
function client(opts: { failUnits?: boolean } = {}) {
  const fetchFn = (async (url: string | URL) => {
    const u = String(url);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (u.endsWith("/token")) return json({ access_token: "t", expires_in: 14400 });
    if (u.includes("orders/bookings")) return json({ content: BOOKINGS });
    if (u.includes("vessel/vesselvisits")) return json({ content: VISITS });
    if (u.includes("inventory/units")) return opts.failUnits ? json({}, 500) : json({ content: UNITS });
    if (u.includes("road/gatetransactions")) return json({ content: GATES });
    return json({ content: [] });
  }) as typeof fetch;
  return new EvpClient({ baseUrl: "https://n4.test/v3/evp", tokenUrl: "https://n4.test/token", clientId: "a", clientSecret: "b", operator: "POHA" }, fetchFn);
}

describe("live Port Houston adapter", () => {
  it("maps a booking: vessel, dates, terminal, equipment and containers", async () => {
    const trace: string[] = [];
    const s = await new NavisPortHoustonAdapter(client()).lookupBooking({ carrierCode: "MAEU", bookingNumber: "mae1234567" }, (l) => trace.push(l));
    expect(s.onFile).toBe(true);
    expect(s.terminal).toBe("BAYPORT");
    expect(s.vesselVisit).toMatchObject({ id: "MHOU", vesselName: "MAERSK HOUSTON", voyage: "247E" });
    expect(s.receivingOpensAt).toBe("2026-11-23T20:00:00.000Z");
    expect(s.cutoffs.find((c) => c.kind === "cargo")?.at).toBe("2026-11-28T23:00:00.000Z");
    expect(s.equipment).toEqual([{ sizeType: "45G1", quantity: 4 }]);
    expect(s.containers!.map((c) => [c.number, c.stage])).toEqual([
      ["MSKU1111111", "LOADED_ON_VESSEL"],
      ["MSKU2222222", "FULL_AT_TERMINAL"],
      ["MSKU3333333", "EMPTY_PICKED_UP"],
    ]);
    expect(containerProgress(s)).toEqual({ booked: 4, pickedUp: 3, atTerminal: 2, loaded: 1 });
    expect(trace.join("\n")).toMatch(/didn't narrow results server-side/);
  });

  it("never keeps other companies' records, and strips other parties from the stored copy", async () => {
    const s = await new NavisPortHoustonAdapter(client()).lookupBooking({ carrierCode: "MAEU", bookingNumber: "MAE1234567" });
    const stored = JSON.stringify(s);
    expect(stored).not.toMatch(/OTHER00001|CMPT9999999|COMPETITOR|SOMEONE ELSE/);
    expect(stored).not.toMatch(/ACME|shipper/i); // shipper names are never stored, even this booking's
  });

  it("matches the carrier exactly: same number under another carrier is a different booking", async () => {
    const s = await new NavisPortHoustonAdapter(client()).lookupBooking({ carrierCode: "HLCU", bookingNumber: "MAE1234567" });
    expect(s.onFile).toBe(false);
    expect(s.raw).toMatchObject({ found: false, sameNumberOtherCarrier: true });
  });

  it("still returns the booking and dates if the container lookup fails", async () => {
    const s = await new NavisPortHoustonAdapter(client({ failUnits: true })).lookupBooking({ carrierCode: "MAEU", bookingNumber: "MAE1234567" });
    expect(s.onFile).toBe(true);
    expect(s.cutoffs.length).toBeGreaterThan(0);
    expect(containerProgress(s)).toMatchObject({ booked: 4, pickedUp: 3, atTerminal: 2 }); // terminal tallies fill the gap
  });

  it("ignores cancelled gate moves and empty-container records", () => {
    const c = buildContainers(
      [{ unitId: "AAAU1", freightKind: "MTY", transitState: "S40_YARD" }],
      [{ subType: "RE", status: "CANCEL", ctrId: "AAAU1", eqoNbr: "B" }],
    );
    expect(c.map((x) => x.stage)).toEqual(["EMPTY_PICKED_UP"]);
  });
});

describe("Test a booking report", () => {
  it("shows each step and what Efficio would show", async () => {
    const { runBookingCheck } = await import("../ports/navis/check");
    const report = (await runBookingCheck("MAEU", "MAE1234567", client())).join("\n");
    expect(report).toMatch(/Booking: .*1 with this carrier ✓/);
    expect(report).toContain("Vessel visit found ✓");
    expect(report).toContain("Vessel: MAERSK HOUSTON / 247E (visit MHOU)");
    expect(report).toContain("Containers: 4 booked · 3 picked up (1 not yet) · 2 at terminal · 1 on vessel");
    expect(report).not.toMatch(/COMPETITOR|OTHER00001/);
    expect(report).toContain("Cargo cutoff: Sat, Nov 28, 5:00 PM"); // 23:00 UTC shown in Houston time
    expect(report).toContain("4 × 40' high cube (45G1)");
  });
});

describe("booked quantity", () => {
  it("reads per-type quantities, and falls back to the booking total", async () => {
    const { equipmentOf } = await import("../ports/navis/adapter");
    expect(equipmentOf({ quantity: 4, items: [{ qty: 4, sampleEquipTypeId: "45G1" }] })).toEqual([{ sizeType: "45G1", quantity: 4 }]);
    expect(equipmentOf({ quantity: 3, items: [] })).toEqual([{ sizeType: "unspecified", quantity: 3 }]);
    expect(equipmentOf({ quantity: 5, items: [{ qty: 3, sampleEquipTypeId: "2210" }] })).toEqual([
      { sizeType: "2210", quantity: 3 },
      { sizeType: "other", quantity: 2 },
    ]);
  });

  it("reports how many are not picked up yet", async () => {
    const { remainingToPickUp } = await import("../domain/containers");
    expect(remainingToPickUp({ booked: 6, pickedUp: 3, atTerminal: 1, loaded: 0 })).toBe(3);
    expect(remainingToPickUp({ booked: 1, pickedUp: 1, atTerminal: 0, loaded: 0 })).toBe(0);
  });
});

describe("finding the carrier for a booking number", () => {
  it("returns only carriers of exact-number matches, without duplicates", async () => {
    const found = await new NavisPortHoustonAdapter(client()).findCarriers("mae1234567");
    expect(found.sort()).toEqual(["MAEU", "MSCU"]); // OTHER00001 (another company's booking) is ignored
  });
});
