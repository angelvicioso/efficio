import { describe, expect, it } from "vitest";
import { lineDates, toIso, type N4VesselVisit } from "../ports/navis/vesselVisits";

// Shape from the NSP API Developer Guide's VesselVisit sample, with dates filled in.
const visit: N4VesselVisit = {
  visitId: "DOB196",
  vesName: "MAERSK HOUSTON",
  visitPhase: "40WORKING",
  publishedEta: "2026-11-29T20:00:00Z",
  publishedEtd: "2026-11-30T20:00:00Z",
  lines: [
    {
      lineId: "MAEU",
      lineInVoyNbr: "246W",
      lineOutVoyNbr: "247E",
      beginReceive: "2026-11-23T20:00:00Z",
      cargoCutoff: "2026-11-28T23:00:00Z",
      reeferCutoff: "2026-11-28T23:00:00Z",
      hazCutoff: "2026-11-27T23:00:00Z",
      emptyPickup: "2026-11-21T14:00:00Z",
    },
    { lineId: "MSCU", lineOutVoyNbr: "FA548W", cargoCutoff: "2026-11-29T05:00:00Z" },
  ],
};

describe("Navis vessel visit mapping", () => {
  it("picks the carrier's line and maps receiving window and cutoffs", () => {
    const d = lineDates(visit, "maeu")!;
    expect(d.vesselVisit).toEqual({
      id: "DOB196",
      vesselName: "MAERSK HOUSTON",
      voyage: "247E",
      eta: "2026-11-29T20:00:00.000Z",
      etd: "2026-11-30T20:00:00.000Z",
    });
    expect(d.receivingOpensAt).toBe("2026-11-23T20:00:00.000Z");
    expect(d.emptyPickupAt).toBe("2026-11-21T14:00:00.000Z");
    expect(d.cutoffs.map((c) => c.kind)).toEqual(["cargo", "reefer", "hazmat"]);
  });

  it("gives different dates per carrier on the same vessel", () => {
    expect(lineDates(visit, "MSCU")!.cutoffs).toEqual([{ kind: "cargo", at: "2026-11-29T05:00:00.000Z", setBy: "terminal" }]);
    expect(lineDates(visit, "MSCU")!.receivingOpensAt).toBeNull();
  });

  it("returns null when the carrier isn't on the vessel", () => {
    expect(lineDates(visit, "HLCU")).toBeNull();
  });

  it("drops dates it can't read instead of guessing", () => {
    expect(toIso(null)).toBeNull();
    expect(toIso("not a date")).toBeNull();
    expect(lineDates({ lines: [{ lineId: "X", cargoCutoff: "garbage" }] }, "X")!.cutoffs).toEqual([]);
  });
});
