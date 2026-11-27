import { describe, expect, it } from "vitest";
import { openDb } from "../db";
import { AccountService } from "../auth/accounts";
import { BookingService } from "../bookings";
import { MockPortHoustonAdapter } from "../ports/mock";
import { filterBookings, filterOptions, isFiltered, NO_FILTERS, parseFilters } from "../domain/filterBookings";

async function setup() {
  const db = openDb(":memory:");
  const acme = new AccountService(db).createOrganization({ name: "Acme Exports", type: "exporter" });
  const s = new BookingService(db, new MockPortHoustonAdapter());
  for (const [c, n] of [["MAEU", "HOU1002"], ["MAEU", "HOU1006"], ["MSCU", "HOU1007"], ["HLCU", "HOU1003"], ["MSCU", "HOU1001"], ["MSCU", "NOTYET1"]]) {
    await s.add(acme, { carrierCode: c, bookingNumber: n });
  }
  return s.list(acme);
}
const nums = (l: { bookingNumber: string }[]) => l.map((b) => b.bookingNumber).sort();
const f = (o: Partial<typeof NO_FILTERS>) => ({ ...NO_FILTERS, ...o });

describe("filtering the bookings list (S-047)", () => {
  it("searches booking numbers and vessel names, case-insensitively", async () => {
    const list = await setup();
    expect(nums(filterBookings(list, f({ q: "hou100" })))).toEqual(["HOU1001", "HOU1002", "HOU1003", "HOU1006", "HOU1007"]);
    expect(nums(filterBookings(list, f({ q: "maersk hou" })))).toEqual(["HOU1002", "HOU1006", "HOU1007"]);
  });

  it("filters by carrier, vessel and status, and combines them", async () => {
    const list = await setup();
    expect(nums(filterBookings(list, f({ carrier: "MSCU" })))).toEqual(["HOU1001", "HOU1007", "NOTYET1"]);
    expect(nums(filterBookings(list, f({ vessel: "MAEHOU247" })))).toEqual(["HOU1002", "HOU1006", "HOU1007"]);
    expect(nums(filterBookings(list, f({ carrier: "MSCU", vessel: "MAEHOU247" })))).toEqual(["HOU1007"]);
    expect(nums(filterBookings(list, f({ status: "CLOSING_SOON" })))).toEqual(["HOU1003"]);
    expect(nums(filterBookings(list, f({ status: "NOT_ON_FILE" })))).toEqual(["NOTYET1"]);
  });

  it("finds bookings that need action", async () => {
    const list = await setup();
    // Empties still to pick up: HOU1006 (6 booked, 3 out), HOU1001 (3 booked, 1 out)
    expect(nums(filterBookings(list, f({ action: "pickup" })))).toEqual(["HOU1001", "HOU1006"]);
    // Still to deliver: everything on file except HOU1007 (3 of 3 delivered)
    expect(nums(filterBookings(list, f({ action: "deliver" })))).toEqual(["HOU1001", "HOU1002", "HOU1003", "HOU1006"]);
  });

  it("offers only values present in the list", async () => {
    const list = await setup();
    const o = filterOptions(list);
    expect(o.carriers.map(([c]) => c)).toEqual(["HLCU", "MAEU", "MSCU"]);
    expect(o.vessels.map(([, l]) => l)).toContain("MAERSK HOUSTON / 247E");
    expect(o.statuses.map(([s]) => s)).toEqual(expect.arrayContaining(["CLOSING_SOON", "OPEN", "NOT_OPEN", "NOT_ON_FILE"]));
    expect(o.statuses.map(([s]) => s)).not.toContain("CLOSED");
  });

  it("reads the page address safely", () => {
    expect(parseFilters({ carrier: "mscu", status: "OPEN", action: "pickup", q: "  sofia " })).toEqual({ ...NO_FILTERS, carrier: "MSCU", status: "OPEN", action: "pickup", q: "sofia" });
    expect(parseFilters({ carrier: "<script>", status: "HACKED", terminal: "MARS", action: "x" })).toEqual(NO_FILTERS);
    expect(isFiltered(NO_FILTERS)).toBe(false);
  });
});
