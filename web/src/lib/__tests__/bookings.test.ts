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

  it("requires a known carrier and a valid number", async () => {
    const { s, acme } = setup();
    await expect(s.add(acme, { carrierCode: "", bookingNumber: "HOU1002" })).rejects.toThrow(/carrier/);
    await expect(s.add(acme, { carrierCode: "XXXX", bookingNumber: "HOU1002" })).rejects.toThrow(/carrier/);
    await expect(s.add(acme, M("ab"))).rejects.toThrow(/4 to 30/);
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
