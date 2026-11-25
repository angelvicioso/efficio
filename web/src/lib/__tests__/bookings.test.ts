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
  return { s: new BookingService(db, adapter), acme: acme.id, globex: globex.id };
}

describe("BookingService", () => {
  it("adds a booking, normalizes the number and fetches it right away", async () => {
    const { s, acme } = setup();
    const { id, created } = await s.add(acme, "  hou1002 ");
    expect(created).toBe(true);
    const b = s.get(acme, id)!;
    expect(b.bookingNumber).toBe("HOU1002");
    expect(b.latest?.data?.onFile).toBe(true);
    expect(b.latest?.data?.terminal).toBe("BAYPORT");
  });

  it("does not duplicate a booking within an organization", async () => {
    const { s, acme } = setup();
    const a = await s.add(acme, "HOU1002");
    const b = await s.add(acme, "hou1002");
    expect(b).toEqual({ id: a.id, created: false });
    expect(s.list(acme)).toHaveLength(1);
  });

  it("keeps each organization's bookings separate", async () => {
    const { s, acme, globex } = setup();
    const a = await s.add(acme, "HOU1002");
    const g = await s.add(globex, "HOU1002"); // same number, different customer
    expect(g.id).not.toBe(a.id);
    expect(s.list(acme).map((b) => b.id)).toEqual([a.id]);
    expect(s.list(globex).map((b) => b.id)).toEqual([g.id]);
    // Another org's ID does nothing:
    expect(s.get(globex, a.id)).toBeNull();
    await expect(s.refresh(globex, a.id)).rejects.toThrow(/not found/);
    s.remove(globex, a.id);
    expect(s.get(acme, a.id)).not.toBeNull();
  });

  it("rejects invalid booking numbers", async () => {
    const { s, acme } = setup();
    await expect(s.add(acme, "ab")).rejects.toThrow(/4 to 30/);
    await expect(s.add(acme, "HOU 1002!")).rejects.toThrow();
  });

  it("records unknown bookings as not on file", async () => {
    const { s, acme } = setup();
    const { id } = await s.add(acme, "UNKNOWN123");
    expect(s.get(acme, id)!.latest?.data?.onFile).toBe(false);
  });

  it("detects a moved cutoff between refreshes", async () => {
    const { s, acme } = setup();
    const { id } = await s.add(acme, "HOU1005");
    await s.refresh(acme, id);
    const b = s.get(acme, id)!;
    const changes = diffSnapshots(b.previous!.data!, b.latest!.data!);
    expect(changes.map((c) => c.field)).toContain("Cargo (CY) cutoff");
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
    const { id } = await s.add(acme, "HOU1002");
    expect(s.get(acme, id)!.latest).toMatchObject({ data: null, error: "port unavailable" });
  });

  it("refreshes all bookings across organizations, or one organization's", async () => {
    const { s, acme, globex } = setup();
    await s.add(acme, "HOU1001");
    await s.add(acme, "HOU1002");
    await s.add(globex, "HOU1003");
    expect(await s.refreshAll()).toBe(3);
    expect(await s.refreshAll(acme)).toBe(2);
  });
});

describe("MockPortHoustonAdapter", () => {
  it("returns the same dates on repeated lookups (except the HOU1005 demo)", async () => {
    let now = new Date("2026-12-01T12:34:00Z");
    const m = new MockPortHoustonAdapter(() => now);
    const a = await m.lookupBooking("HOU1002");
    now = new Date("2026-12-01T13:50:00Z");
    const b = await m.lookupBooking("HOU1002");
    expect(diffSnapshots(a, b)).toEqual([]);
  });
});
