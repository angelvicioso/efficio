import { describe, expect, it } from "vitest";
import { groupByVessel } from "../domain/vessels";
import { openDb } from "../db";
import { AccountService } from "../auth/accounts";
import { BookingService } from "../bookings";
import { MockPortHoustonAdapter } from "../ports/mock";

async function setup() {
  const db = openDb(":memory:");
  const accounts = new AccountService(db);
  const acme = accounts.createOrganization({ name: "Acme Exports", type: "exporter" });
  const globex = accounts.createOrganization({ name: "Globex Shipping", type: "exporter" });
  const s = new BookingService(db, new MockPortHoustonAdapter());
  for (const [carrierCode, bookingNumber] of [["MAEU", "HOU1002"], ["MAEU", "HOU1006"], ["MSCU", "HOU1007"], ["HLCU", "HOU1003"], ["MAEU", "NOTREAL1"]]) {
    await s.add(acme, { carrierCode, bookingNumber });
  }
  await s.add(globex, { carrierCode: "MSCU", bookingNumber: "HOU1001" });
  return { s, acme, globex };
}

describe("groupByVessel (S-040)", () => {
  it("groups bookings on the same vessel, across carriers", async () => {
    const { s, acme } = await setup();
    const { vessels, unassigned } = groupByVessel(s.list(acme));
    const maersk = vessels.find((v) => v.vesselName === "MAERSK HOUSTON")!;
    expect(maersk.bookings.map((b) => b.bookingNumber).sort()).toEqual(["HOU1002", "HOU1006", "HOU1007"]);
    expect(new Set(maersk.bookings.map((b) => b.carrierCode))).toEqual(new Set(["MAEU", "MSCU"]));
    expect(unassigned.map((b) => b.bookingNumber)).toEqual(["NOTREAL1"]);
  });

  it("puts the earliest cutoff first and reports it as next", async () => {
    const { s, acme } = await setup();
    const maersk = groupByVessel(s.list(acme)).vessels.find((v) => v.vesselName === "MAERSK HOUSTON")!;
    expect(maersk.bookings[0].bookingNumber).toBe("HOU1007"); // MSC's cutoff is earlier on the same ship
    expect(maersk.nextCutoff?.booking.bookingNumber).toBe("HOU1007");
    expect(maersk.stateCounts).toEqual({ OPEN: 3 });
  });

  it("orders vessels by departure and only includes the viewer's bookings", async () => {
    const { s, acme, globex } = await setup();
    expect(groupByVessel(s.list(acme)).vessels.map((v) => v.vesselName)).toEqual(["HAMBURG EXPRESS", "MAERSK HOUSTON"]);
    expect(groupByVessel(s.list(globex)).vessels.map((v) => v.vesselName)).toEqual(["MSC AURORA"]);
  });

  it("skips passed cutoffs when picking the next one", async () => {
    const { s, acme } = await setup();
    const later = new Date(Date.now() + 5 * 86_400_000); // after every Maersk Houston cutoff
    const maersk = groupByVessel(s.list(acme), later).vessels.find((v) => v.vesselName === "MAERSK HOUSTON")!;
    expect(maersk.nextCutoff).toBeNull();
    expect(maersk.stateCounts).toEqual({ CLOSED: 3 });
  });
});
