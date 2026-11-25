import { describe, expect, it } from "vitest";
import { openDb } from "../db";
import { BookingService } from "../bookings";
import { MockPortHoustonAdapter } from "../ports/mock";
import { diffSnapshots } from "../domain/changes";
import type { PortAdapter } from "../ports/adapter";

function setup(adapter: PortAdapter = new MockPortHoustonAdapter()) {
  return new BookingService(openDb(":memory:"), adapter);
}

describe("BookingService", () => {
  it("adds a booking, normalizes the number and fetches it right away", async () => {
    const s = setup();
    const { id, created } = await s.add("  hou1002 ");
    expect(created).toBe(true);
    const b = s.get(id)!;
    expect(b.bookingNumber).toBe("HOU1002");
    expect(b.latest?.data?.onFile).toBe(true);
    expect(b.latest?.data?.terminal).toBe("BAYPORT");
  });

  it("does not duplicate a booking that is already tracked", async () => {
    const s = setup();
    const a = await s.add("HOU1002");
    const b = await s.add("hou1002");
    expect(b).toEqual({ id: a.id, created: false });
    expect(s.list()).toHaveLength(1);
  });

  it("rejects invalid booking numbers", async () => {
    await expect(setup().add("ab")).rejects.toThrow(/4 to 30/);
    await expect(setup().add("HOU 1002!")).rejects.toThrow();
  });

  it("records unknown bookings as not on file", async () => {
    const s = setup();
    const { id } = await s.add("UNKNOWN123");
    expect(s.get(id)!.latest?.data?.onFile).toBe(false);
  });

  it("detects a moved cutoff between refreshes", async () => {
    const s = setup();
    const { id } = await s.add("HOU1005");
    await s.refresh(id);
    const b = s.get(id)!;
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
    const s = setup(failing);
    const { id } = await s.add("HOU1002");
    expect(s.get(id)!.latest).toMatchObject({ data: null, error: "port unavailable" });
  });

  it("refreshes all bookings and removes one", async () => {
    const s = setup();
    const a = await s.add("HOU1001");
    await s.add("HOU1002");
    expect(await s.refreshAll()).toBe(2);
    s.remove(a.id);
    expect(s.list().map((b) => b.bookingNumber)).toEqual(["HOU1002"]);
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
