import { describe, expect, it } from "vitest";
import { containerCheckDigit, containerProgress, isValidContainerNumber, remainingToDeliver } from "../domain/containers";
import { diffSnapshots } from "../domain/changes";
import { groupByCarrier, groupByVessel } from "../domain/vessels";
import { MockPortHoustonAdapter, MOCK_SCENARIOS } from "../ports/mock";
import { openDb } from "../db";
import { AccountService } from "../auth/accounts";
import { BookingService } from "../bookings";
import type { PortBookingSnapshot } from "../domain/types";

describe("ISO 6346 container numbers", () => {
  it("computes the check digit (standard example CSQU3054383)", () => {
    expect(containerCheckDigit("CSQU305438")).toBe(3);
    expect(isValidContainerNumber("CSQU3054383")).toBe(true);
    expect(isValidContainerNumber("CSQU3054384")).toBe(false);
    expect(isValidContainerNumber("CSQU305438")).toBe(false);
  });

  it("the simulated containers all have valid numbers", async () => {
    const m = new MockPortHoustonAdapter();
    for (const [num, s] of Object.entries(MOCK_SCENARIOS)) {
      const snap = await m.lookupBooking({ carrierCode: s.carrierCode, bookingNumber: num });
      for (const c of snap.containers ?? []) expect(isValidContainerNumber(c.number), c.number).toBe(true);
    }
  });
});

describe("container progress", () => {
  it("counts cumulatively: loaded containers were also picked up and delivered", async () => {
    const snap = await new MockPortHoustonAdapter().lookupBooking({ carrierCode: "CMDU", bookingNumber: "HOU1004" });
    expect(containerProgress(snap)).toEqual({ booked: 5, pickedUp: 5, atTerminal: 4, loaded: 3 }); // one missed the cutoff (demo)
  });

  it("reports what's left to deliver", async () => {
    const snap = await new MockPortHoustonAdapter().lookupBooking({ carrierCode: "MAEU", bookingNumber: "HOU1006" });
    const p = containerProgress(snap);
    expect(p).toEqual({ booked: 6, pickedUp: 3, atTerminal: 1, loaded: 0 });
    expect(remainingToDeliver(p)).toBe(5);
  });

  it("handles snapshots without container data (older readings)", () => {
    expect(containerProgress({ cutoffs: [] } as unknown as PortBookingSnapshot)).toEqual({ booked: 0, pickedUp: 0, atTerminal: 0, loaded: 0 });
  });

  it("event times are in the past and in order", async () => {
    const now = Date.now();
    const snap = await new MockPortHoustonAdapter().lookupBooking({ carrierCode: "CMDU", bookingNumber: "HOU1004" });
    for (const c of snap.containers!) {
      expect(Date.parse(c.emptyPickedUpAt!)).toBeLessThan(now);
      if (c.fullGateInAt) expect(Date.parse(c.fullGateInAt)).toBeGreaterThan(Date.parse(c.emptyPickedUpAt!));
      if (c.loadedAt) expect(Date.parse(c.loadedAt)).toBeGreaterThan(Date.parse(c.fullGateInAt!));
    }
  });

  it("change detection reports container count changes", async () => {
    const a = await new MockPortHoustonAdapter().lookupBooking({ carrierCode: "MAEU", bookingNumber: "HOU1002" });
    const b = { ...a, containers: a.containers!.map((c, i) => (i === 2 ? { ...c, stage: "FULL_AT_TERMINAL" as const, fullGateInAt: a.fetchedAt } : c)) };
    expect(diffSnapshots(a, b)).toEqual([{ field: "Loaded, at terminal", before: "2", after: "3" }]);
  });
});

describe("totals by vessel and carrier (Q-032: only your own containers)", () => {
  async function setup() {
    const db = openDb(":memory:");
    const accounts = new AccountService(db);
    const acme = accounts.createOrganization({ name: "Acme Exports", type: "exporter" });
    const globex = accounts.createOrganization({ name: "Globex Shipping", type: "exporter" });
    const s = new BookingService(db, new MockPortHoustonAdapter());
    for (const [carrierCode, bookingNumber] of [["MAEU", "HOU1002"], ["MAEU", "HOU1006"], ["MSCU", "HOU1007"], ["MSCU", "HOU1001"]]) {
      await s.add(acme, { carrierCode, bookingNumber });
    }
    await s.add(globex, { carrierCode: "MAEU", bookingNumber: "HOU1006" }); // shares a booking, adds nothing to Acme's totals
    return { s, acme, globex };
  }

  it("sums containers per vessel across carriers", async () => {
    const { s, acme } = await setup();
    const v = groupByVessel(s.list(acme)).vessels.find((x) => x.vesselName === "MAERSK HOUSTON")!;
    // HOU1002 (4) + HOU1006 (6) + HOU1007 (3)
    expect(v.containers).toEqual({ booked: 13, pickedUp: 10, atTerminal: 6, loaded: 0 });
  });

  it("groups by carrier with vessel counts and totals", async () => {
    const { s, acme, globex } = await setup();
    const groups = groupByCarrier(s.list(acme));
    const msc = groups.find((g) => g.carrierCode === "MSCU")!;
    expect(msc.bookings.map((b) => b.bookingNumber).sort()).toEqual(["HOU1001", "HOU1007"]);
    expect(msc.vesselCount).toBe(2); // MAERSK HOUSTON and MSC AURORA
    expect(msc.containers.booked).toBe(6);
    expect(groups.find((g) => g.carrierCode === "MAEU")!.containers.booked).toBe(10);
    expect(groupByCarrier(s.list(globex)).map((g) => [g.carrierCode, g.containers.booked])).toEqual([["MAEU", 6]]);
  });

  it("orders carriers by their next cutoff", async () => {
    const { s, acme } = await setup();
    // MSC has HOU1007 with the earliest upcoming cutoff on MAERSK HOUSTON
    expect(groupByCarrier(s.list(acme)).map((g) => g.carrierCode)).toEqual(["MSCU", "MAEU"]);
  });
});

describe("size/type labels", () => {
  it("covers current and older ISO codes seen at Port Houston", async () => {
    const { sizeTypeLabel } = await import("../domain/types");
    expect(sizeTypeLabel("2210")).toBe("20' standard");
    expect(sizeTypeLabel("45G1")).toBe("40' high cube");
    expect(sizeTypeLabel("ZZZZ")).toBe("ZZZZ");
  });
});
