import { describe, expect, it } from "vitest";
import { openDb } from "../db";
import { BookingService } from "../bookings";
import { AccountService } from "../auth/accounts";
import { MockPortHoustonAdapter } from "../ports/mock";
import { diffSnapshots } from "../domain/changes";
import type { PortAdapter } from "../ports/adapter";

function setup(adapter: PortAdapter = new MockPortHoustonAdapter()) {
  const db = openDb(":memory:");
  const accounts = new AccountService(db);
  const acme = accounts.createOrganization({ name: "Acme Exports", type: "exporter" });
  const globex = accounts.createOrganization({ name: "Globex Shipping", type: "exporter" });
  const maersk = accounts.createOrganization({ name: "Maersk", type: "ocean_carrier", carrierCode: "MAEU" });
  const msc = accounts.createOrganization({ name: "MSC", type: "ocean_carrier", carrierCode: "MSCU" });
  const trucker = accounts.createOrganization({ name: "Lone Star Trucking", type: "trucking" });
  return { s: new BookingService(db, adapter), acme, globex, maersk, msc, trucker, db };
}

const M = (bookingNumber: string) => ({ carrierCode: "MAEU", bookingNumber });

describe("adding bookings", () => {
  it("adds a booking by carrier + number, normalizes it and fetches port data", async () => {
    const { s, acme } = setup();
    const { id, created } = await s.add(acme, M("  hou1002 "));
    expect(created).toBe(true);
    const b = s.get(acme, id)!;
    expect(b).toMatchObject({ bookingNumber: "HOU1002", carrierCode: "MAEU" });
    expect(b.access).toMatchObject({ role: "exporter", status: "claimed", via: "party" });
    expect(b.latest?.data?.onFile).toBe(true);
  });

  it("requires a valid carrier code and booking number", async () => {
    const { s, acme } = setup();
    await expect(s.add(acme, { carrierCode: "XX", bookingNumber: "HOU1002" })).rejects.toThrow(/carrier/);
    await expect(s.add(acme, M("ab"))).rejects.toThrow(/4 to 30/);
  });

  it("finds the carrier automatically when none is chosen (D-033)", async () => {
    const { s, acme } = setup();
    const { id } = await s.add(acme, { carrierCode: "", bookingNumber: "hou1002" });
    expect(s.get(acme, id)).toMatchObject({ carrierCode: "MAEU", bookingNumber: "HOU1002" });
    expect(s.get(acme, id)!.latest?.data?.onFile).toBe(true);
  });

  it("asks for the carrier when the port doesn't have the booking yet", async () => {
    const { s, acme } = setup();
    await expect(s.add(acme, { carrierCode: "", bookingNumber: "NOTYET123" })).rejects.toThrow(/Choose the carrier to start tracking it anyway/);
    // Choosing it still works: the booking is tracked as not yet at the terminal
    const { id } = await s.add(acme, { carrierCode: "MSCU", bookingNumber: "NOTYET123" });
    expect(s.get(acme, id)!.latest?.data?.onFile).toBe(false);
  });

  it("asks for the carrier when the number exists under several carriers", async () => {
    const db = openDb(":memory:");
    const acme = new AccountService(db).createOrganization({ name: "Acme Exports", type: "exporter" });
    const twoCarriers: PortAdapter = { ...new MockPortHoustonAdapter(), source: "mock", displayName: "x", lookupBooking: new MockPortHoustonAdapter().lookupBooking, findCarriers: async () => ["MAEU", "MSCU"] };
    await expect(new BookingService(db, twoCarriers).add(acme, { carrierCode: "", bookingNumber: "HOU1002" })).rejects.toThrow(/more than one carrier \(Maersk, MSC\)/);
  });

  it("explains when the port can't be reached to find the carrier", async () => {
    const db = openDb(":memory:");
    const acme = new AccountService(db).createOrganization({ name: "Acme Exports", type: "exporter" });
    const down: PortAdapter = { source: "x", displayName: "x", lookupBooking: async () => { throw new Error("down"); }, findCarriers: async () => { throw new Error("down"); } };
    await expect(new BookingService(db, down).add(acme, { carrierCode: "", bookingNumber: "HOU1002" })).rejects.toThrow(/Couldn't reach the port/);
  });

  it("accepts carriers outside the dropdown list when the port reports them", async () => {
    const { s, acme } = setup();
    const { id } = await s.add(acme, { carrierCode: "SMLU", bookingNumber: "ANYNUM1" });
    expect(s.get(acme, id)!.carrierCode).toBe("SMLU");
  });

  it("shows not on file when the carrier is wrong", async () => {
    const { s, acme } = setup();
    const { id } = await s.add(acme, { carrierCode: "MSCU", bookingNumber: "HOU1002" }); // HOU1002 is Maersk's
    expect(s.get(acme, id)!.latest?.data?.onFile).toBe(false);
  });

  it("treats the same number under different carriers as different bookings", async () => {
    const { s, acme } = setup();
    const a = await s.add(acme, M("HOU1002"));
    const b = await s.add(acme, { carrierCode: "MSCU", bookingNumber: "HOU1002" });
    expect(a.id).not.toBe(b.id);
  });

  it("does not duplicate a booking for the same organization", async () => {
    const { s, acme } = setup();
    const a = await s.add(acme, M("HOU1002"));
    expect(await s.add(acme, M("hou1002"))).toEqual({ id: a.id, created: false });
  });
});

describe("who sees what (P-001)", () => {
  it("shares one booking record between parties and its carrier", async () => {
    const { s, acme, trucker, maersk } = setup();
    const a = await s.add(acme, M("HOU1002"));
    const t = await s.add(trucker, M("HOU1002"));
    expect(t.id).toBe(a.id);
    expect(s.get(trucker, a.id)!.access.role).toBe("trucker");
    expect(s.get(maersk, a.id)!.access).toMatchObject({ role: "carrier", status: "verified", via: "carrier" });
  });

  it("carriers see all their customers' bookings, customers see only their own", async () => {
    const { s, acme, globex, maersk, msc } = setup();
    const a1 = await s.add(acme, M("HOU1002"));
    const a2 = await s.add(acme, { carrierCode: "MSCU", bookingNumber: "HOU2001" });
    const g1 = await s.add(globex, M("HOU1003"));

    expect(s.list(maersk).map((b) => b.id).sort()).toEqual([a1.id, g1.id].sort());
    expect(s.list(msc).map((b) => b.id)).toEqual([a2.id]);
    expect(s.list(acme).map((b) => b.id).sort()).toEqual([a1.id, a2.id].sort());
    expect(s.list(globex).map((b) => b.id)).toEqual([g1.id]);

    // No access through IDs either
    expect(s.get(globex, a1.id)).toBeNull();
    expect(s.get(msc, a1.id)).toBeNull();
    await expect(s.refresh(globex, a1.id)).rejects.toThrow(/not found/);
    expect(s.history(globex, a1.id)).toEqual([]);
  });

  it("never reveals that another company claimed the same booking", async () => {
    const { s, acme, globex, maersk } = setup();
    const { id } = await s.add(acme, M("HOU1002"));
    await s.refresh(acme, id);
    await new Promise((r) => setTimeout(r, 5)); // Globex joins later
    await s.add(globex, M("HOU1002"));

    // Globex sees only itself on the booking, and only history from when it joined.
    expect(s.parties(globex, id).map((p) => p.orgName)).toEqual(["Globex Shipping"]);
    expect(s.history(globex, id)).toHaveLength(1);
    expect(s.get(globex, id)!.previous).toBeNull();
    // Acme still has its full history; the carrier sees both parties.
    expect(s.history(acme, id)).toHaveLength(3);
    expect(s.parties(maersk, id).map((p) => p.orgName).sort()).toEqual(["Acme Exports", "Globex Shipping"]);
  });

  it("only the carrier can verify or remove parties", async () => {
    const { s, acme, globex, maersk, msc } = setup();
    const { id } = await s.add(acme, M("HOU1002"));
    await s.add(globex, M("HOU1002"));
    expect(() => s.verifyParty(acme, id, acme.id)).toThrow(/carrier/);
    expect(() => s.verifyParty(msc, id, acme.id)).toThrow(/carrier/);

    s.verifyParty(maersk, id, acme.id);
    expect(s.get(acme, id)!.access.status).toBe("verified");
    s.removeParty(maersk, id, globex.id);
    expect(s.get(globex, id)).toBeNull();
  });

  it("carriers can add only their own bookings", async () => {
    const { s, maersk } = setup();
    await expect(s.add(maersk, { carrierCode: "MSCU", bookingNumber: "HOU1002" })).rejects.toThrow(/own bookings/);
    const { id } = await s.add(maersk, M("HOU1002"));
    expect(s.get(maersk, id)!.access.via).toBe("carrier");
  });

  it("deletes the shared record once nobody follows it", async () => {
    const { s, acme, globex, db } = setup();
    // A carrier without an organization on Efficio:
    const { id } = await s.add(acme, { carrierCode: "HLCU", bookingNumber: "HOU1003" });
    await s.add(globex, { carrierCode: "HLCU", bookingNumber: "HOU1003" });
    s.remove(acme, id);
    expect(s.get(globex, id)).not.toBeNull();
    s.remove(globex, id);
    expect(db.prepare("SELECT COUNT(*) AS n FROM bookings").get()).toEqual({ n: 0 });
  });

  it("keeps bookings whose carrier is on Efficio", async () => {
    const { s, acme, maersk } = setup();
    const { id } = await s.add(acme, M("HOU1002"));
    s.remove(acme, id);
    expect(s.get(acme, id)).toBeNull();
    expect(s.get(maersk, id)).not.toBeNull();
  });
});

describe("refreshing", () => {
  it("detects a moved cutoff between refreshes", async () => {
    const { s, acme } = setup();
    const { id } = await s.add(acme, { carrierCode: "ONEY", bookingNumber: "HOU1005" });
    await s.refresh(acme, id);
    const b = s.get(acme, id)!;
    expect(diffSnapshots(b.previous!.data!, b.latest!.data!).map((c) => c.field)).toContain("Cargo (CY) cutoff");
  });

  it("stores adapter errors instead of failing", async () => {
    const failing: PortAdapter = {
      source: "broken",
      displayName: "Broken",
      lookupBooking: async () => {
        throw new Error("port unavailable");
      },
      findCarriers: async () => {
        throw new Error("port unavailable");
      },
    };
    const { s, acme } = setup(failing);
    const { id } = await s.add(acme, M("HOU1002"));
    expect(s.get(acme, id)!.latest).toMatchObject({ data: null, error: "port unavailable" });
  });

  it("refreshes each shared booking once, for everyone or for one viewer", async () => {
    const { s, acme, globex, maersk } = setup();
    await s.add(acme, M("HOU1002"));
    await s.add(globex, M("HOU1002"));
    await s.add(globex, { carrierCode: "HLCU", bookingNumber: "HOU1003" });
    expect(await s.refreshAll()).toBe(2);
    expect(await s.refreshAll(maersk)).toBe(1);
    expect(await s.refreshAll(globex)).toBe(2);
  });
});

describe("MockPortHoustonAdapter", () => {
  it("returns the same dates on repeated lookups (except the HOU1005 demo)", async () => {
    let now = new Date("2026-12-01T12:34:00Z");
    const m = new MockPortHoustonAdapter(() => now);
    const a = await m.lookupBooking(M("HOU1002"));
    now = new Date("2026-12-01T13:50:00Z");
    const b = await m.lookupBooking(M("HOU1002"));
    expect(diffSnapshots(a, b)).toEqual([]);
  });
});

describe("adding many bookings at once (S-046)", () => {
  it("reads numbers separated by new lines, commas, semicolons, spaces or tabs, without duplicates", async () => {
    const { parseBookingNumbers } = await import("../bookings");
    expect(parseBookingNumbers("HOU1002\nhou1003, HOU1006;HOU1007\tHOU1002  \n\n")).toEqual(["HOU1002", "HOU1003", "HOU1006", "HOU1007"]);
    expect(parseBookingNumbers(" , ;\n")).toEqual([]);
  });

  it("adds each number and reports what happened to every one", async () => {
    const { s, acme } = setup();
    await s.add(acme, M("HOU1002"));
    const results = await s.addMany(acme, { carrierCode: "", text: "HOU1002\nHOU1003, HOU1006 NOTYET99 ab" });
    expect(results.map((r) => [r.bookingNumber, r.outcome])).toEqual([
      ["HOU1002", "already"],
      ["HOU1003", "added"],
      ["HOU1006", "added"],
      ["NOTYET99", "needs_carrier"],
      ["AB", "invalid"],
    ]);
    expect(results.find((r) => r.bookingNumber === "HOU1003")!.carrierCode).toBe("HLCU");
    expect(s.list(acme)).toHaveLength(3);
  });

  it("uses a chosen carrier for every number in the batch", async () => {
    const { s, acme } = setup();
    const results = await s.addMany(acme, { carrierCode: "MSCU", text: "NOTYET1, NOTYET2" });
    expect(results.map((r) => r.outcome)).toEqual(["added", "added"]);
    expect(s.list(acme).every((b) => b.carrierCode === "MSCU")).toBe(true);
  });

  it("refuses an empty box and more than 50 at a time", async () => {
    const { s, acme } = setup();
    await expect(s.addMany(acme, { carrierCode: "", text: "  ,  " })).rejects.toThrow(/at least one/);
    const many = Array.from({ length: 51 }, (_, i) => `BK${1000 + i}`).join(",");
    await expect(s.addMany(acme, { carrierCode: "MAEU", text: many })).rejects.toThrow(/up to 50/);
  });
});
