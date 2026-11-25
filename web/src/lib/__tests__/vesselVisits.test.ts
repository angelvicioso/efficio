import { describe, expect, it } from "vitest";
import { lineDates, terminalFor, toIso, type N4VesselVisit } from "../ports/navis/vesselVisits";

const ms = (iso: string) => Date.parse(iso);

// Shape seen in Port Houston's real response: epoch-ms dates on the visit, per-line dates often null.
const visit: N4VesselVisit = {
  visitId: "MHOU",
  vesName: "MAERSK HOUSTON ",
  facility: "BPT",
  obVyg: "247",
  beginReceive: ms("2026-11-23T20:00:00Z"),
  cargoCutoff: ms("2026-11-28T23:00:00Z"),
  hazCutoff: ms("2026-11-27T23:00:00Z"),
  reeferCutoff: null,
  publishedEta: null,
  eta: null,
  lines: [
    { lineId: "MAE", lineOutVoyNbr: "247E", beginReceive: null, cargoCutoff: null },
    { lineId: "MSC", lineOutVoyNbr: "FX247E", cargoCutoff: ms("2026-11-28T05:00:00Z") },
  ],
};

describe("Navis vessel visit mapping (real response shape)", () => {
  it("reads epoch-millisecond dates, falling back from the line to the visit", () => {
    const d = lineDates(visit, "MAE");
    expect(d.receivingOpensAt).toBe("2026-11-23T20:00:00.000Z");
    expect(d.cutoffs).toEqual([
      { kind: "cargo", at: "2026-11-28T23:00:00.000Z", setBy: "terminal" },
      { kind: "hazmat", at: "2026-11-27T23:00:00.000Z", setBy: "terminal" },
    ]);
    expect(d.vesselVisit).toMatchObject({ id: "MHOU", vesselName: "MAERSK HOUSTON", voyage: "247E" });
    expect(d.terminal).toBe("BAYPORT");
  });

  it("uses a line's own dates when it has them", () => {
    expect(lineDates(visit, "msc").cutoffs[0].at).toBe("2026-11-28T05:00:00.000Z");
  });

  it("falls back to the visit's dates and voyage when the line isn't listed", () => {
    const d = lineDates(visit, "HLC");
    expect(d.cutoffs[0].at).toBe("2026-11-28T23:00:00.000Z");
    expect(d.vesselVisit.voyage).toBe("247");
  });

  it("parses every date form and drops unreadable ones", () => {
    expect(toIso(1764370800000)).toBe("2025-11-28T23:00:00.000Z");
    expect(toIso(1764370800)).toBe("2025-11-28T23:00:00.000Z");
    expect(toIso("1764370800000")).toBe("2025-11-28T23:00:00.000Z");
    expect(toIso("2026-11-28T23:00:00Z")).toBe("2026-11-28T23:00:00.000Z");
    expect(toIso(null)).toBeNull();
    expect(toIso("garbage")).toBeNull();
    expect(toIso(0)).toBeNull();
  });

  it("maps facility codes to terminals", () => {
    expect(terminalFor("BPT")).toBe("BAYPORT");
    expect(terminalFor("BCT")).toBe("BARBOURS_CUT");
    expect(terminalFor("XYZ")).toBeNull();
  });
});
