import { describe, expect, it } from "vitest";
import { openDb } from "../db";
import { AccountService } from "../auth/accounts";
import { BookingService } from "../bookings";
import { MockPortHoustonAdapter } from "../ports/mock";
import { parseSort, sortBookings } from "../domain/sortBookings";

async function setup() {
  const db = openDb(":memory:");
  const acme = new AccountService(db).createOrganization({ name: "Acme Exports", type: "exporter" });
  const s = new BookingService(db, new MockPortHoustonAdapter());
  // HOU1002: 4 booked/4 picked/2 in · HOU1006: 6/3/1 · HOU1007: 3/3/3 · HOU1003: 2/2/1 · NOTYET1: not on file
  for (const [c, n] of [["MAEU", "HOU1002"], ["MAEU", "HOU1006"], ["MSCU", "HOU1007"], ["HLCU", "HOU1003"], ["MSCU", "NOTYET1"]]) {
    await s.add(acme, { carrierCode: c, bookingNumber: n });
  }
  return s.list(acme);
}
const nums = (list: { bookingNumber: string }[]) => list.map((b) => b.bookingNumber);

describe("sorting the bookings list", () => {
  it("sorts by containers, picked up and at terminal, either direction, missing values last", async () => {
    const list = await setup();
    expect(nums(sortBookings(list, "containers", "desc"))).toEqual(["HOU1006", "HOU1002", "HOU1007", "HOU1003", "NOTYET1"]);
    expect(nums(sortBookings(list, "containers", "asc"))).toEqual(["HOU1003", "HOU1007", "HOU1002", "HOU1006", "NOTYET1"]);
    // HOU1006 and HOU1003 tie at 1: ties keep the list's normal order (newest first)
    expect(nums(sortBookings(list, "atTerminal", "desc"))).toEqual(["HOU1007", "HOU1002", "HOU1003", "HOU1006", "NOTYET1"]);
    expect(nums(sortBookings(list, "pickedUp", "asc")).at(-1)).toBe("NOTYET1");
  });

  it("sorts by booking number and carrier name", async () => {
    const list = await setup();
    expect(nums(sortBookings(list, "booking", "asc"))).toEqual(["HOU1002", "HOU1003", "HOU1006", "HOU1007", "NOTYET1"]);
    expect(sortBookings(list, "carrier", "asc").map((b) => b.carrierCode)).toEqual(["HLCU", "MAEU", "MAEU", "MSCU", "MSCU"]);
  });

  it("sorts status by urgency: closing soon first, not-at-terminal near the end", async () => {
    const list = await setup();
    const sorted = nums(sortBookings(list, "status", "asc"));
    expect(sorted[0]).toBe("HOU1003"); // closing soon
    expect(sorted.at(-1)).toBe("NOTYET1");
  });

  it("sorts by cutoff, soonest first", async () => {
    const list = await setup();
    expect(nums(sortBookings(list, "cutoff", "asc")).slice(0, 2)).toEqual(["HOU1003", "HOU1007"]);
  });

  it("keeps the default order without a valid sort, and reads the address safely", async () => {
    const list = await setup();
    expect(sortBookings(list, null, "asc")).toBe(list);
    expect(parseSort("containers", "desc")).toEqual({ key: "containers", dir: "desc" });
    expect(parseSort("password", "sideways")).toEqual({ key: null, dir: "asc" });
  });
});
