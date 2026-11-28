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
    // Empties still to pick up: HOU1006 (6 booked, 3 out), HOU1001 (3 booked, 1 out), HOU1003 (3 booked, 2 out)
    expect(nums(filterBookings(list, f({ action: "pickup" })))).toEqual(["HOU1001", "HOU1003", "HOU1006"]);
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

describe("date filters (S-048)", () => {
  it("turns Houston days into the right instants, including daylight saving", async () => {
    const { houstonDayStart } = await import("../domain/filterBookings");
    expect(new Date(houstonDayStart("2026-11-27")).toISOString()).toBe("2026-11-27T06:00:00.000Z"); // CST
    expect(new Date(houstonDayStart("2026-07-04")).toISOString()).toBe("2026-07-04T05:00:00.000Z"); // CDT
  });

  it("custom 'To' includes the whole Houston day, not the UTC day", async () => {
    const { dateWindow } = await import("../domain/filterBookings");
    const [start, end] = dateWindow(f({ range: "custom", from: "2026-11-27", to: "2026-11-27" }))!;
    expect(start).toBe(Date.parse("2026-11-27T06:00:00Z"));
    expect(end).toBe(Date.parse("2026-11-28T06:00:00Z")); // 11:59 PM on Nov 27 in Houston is still inside
    // Across the November daylight-saving change, the day is 25 hours long
    const [s2, e2] = dateWindow(f({ range: "custom", from: "2026-11-01", to: "2026-11-01" }))!;
    expect((e2 - s2) / 3_600_000).toBe(25);
  });

  it("filters by cutoff, receiving opens or departure, with presets and custom days", async () => {
    const list = await setup();
    // Cutoffs relative to now: HOU1003 ~20h, HOU1007 ~3d15h, HOU1002/1006 ~4d3h, HOU1001 6d
    expect(nums(filterBookings(list, f({ dateField: "cutoff", range: "next24h" })))).toEqual(["HOU1003"]);
    expect(nums(filterBookings(list, f({ dateField: "cutoff", range: "next7d" })))).toEqual(["HOU1001", "HOU1002", "HOU1003", "HOU1006", "HOU1007"]);
    // Receiving opened in the past week: everything already open; HOU1001 opens in ~2 days
    expect(nums(filterBookings(list, f({ dateField: "opens", range: "past7d" })))).toEqual(["HOU1002", "HOU1003", "HOU1006", "HOU1007"]);
    // Bookings without the date (not at the terminal) are left out while a date filter is on
    expect(nums(filterBookings(list, f({ dateField: "departs", range: "next14d" })))).not.toContain("NOTYET1");
  });

  it("custom range with only From or only To is open-ended; empty custom range filters nothing", async () => {
    const list = await setup();
    const today = new Date().toISOString().slice(0, 10);
    expect(filterBookings(list, f({ range: "custom", from: "2000-01-01" })).length).toBe(5);
    expect(filterBookings(list, f({ range: "custom", to: "2000-01-01" })).length).toBe(0);
    expect(filterBookings(list, f({ range: "custom" })).length).toBe(6);
    expect(isFiltered(f({ range: "custom" }))).toBe(false);
    expect(isFiltered(f({ range: "custom", from: today }))).toBe(true);
  });

  it("reads date settings from the address safely", () => {
    expect(parseFilters({ dateField: "opens", range: "custom", from: "2026-11-27", to: "nope" })).toMatchObject({ dateField: "opens", range: "custom", from: "2026-11-27", to: "" });
    expect(parseFilters({ dateField: "birthday", range: "forever" })).toMatchObject({ dateField: "", range: "" });
  });
});
