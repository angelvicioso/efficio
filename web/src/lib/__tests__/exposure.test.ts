import { describe, expect, it } from "vitest";
import type { TrackedBooking } from "../bookings";
import type { Container, PortBookingSnapshot } from "../domain/types";
import { bookingExposure, detentionFor, totalExposure } from "../domain/exposure";
import { defaultRates } from "../domain/rates";
import { openDb } from "../db";
import { AccountService } from "../auth/accounts";
import { RatesService } from "../ratesService";

const now = new Date("2026-12-01T12:00:00Z");
const H = 3_600_000;
const at = (h: number) => new Date(now.getTime() + h * H).toISOString();
const r = defaultRates();

function container(o: Partial<Container> & { stage: Container["stage"] }): Container {
  return { number: "TEST0000000", sizeType: "45G1", emptyPickedUpAt: null, fullGateInAt: null, loadedAt: null, ...o };
}

function booking(containers: Container[], cutoffInH: number, booked = containers.length): TrackedBooking {
  const data: PortBookingSnapshot = {
    source: "test",
    bookingNumber: "B1",
    onFile: true,
    terminal: "BAYPORT",
    carrierCode: "MAEU",
    vesselVisit: { id: "V1", vesselName: "SHIP", voyage: "1", eta: null, etd: at(cutoffInH + 48) },
    receivingOpensAt: at(-72),
    cutoffs: [{ kind: "cargo", at: at(cutoffInH), setBy: "terminal" }],
    equipment: [{ sizeType: "45G1", quantity: booked }],
    containers,
    raw: null,
    fetchedAt: now.toISOString(),
  };
  return {
    id: 1, carrierCode: "MAEU", bookingNumber: "B1", createdAt: at(-200),
    access: { role: "exporter", status: "claimed", via: "party", since: 0 },
    latest: { id: 1, fetchedAt: now.toISOString(), source: "test", data, error: null },
    previous: null,
  };
}

describe("money at risk (S-060)", () => {
  it("detention: free days, then $360/day for days 4-6, then $465/day", () => {
    expect(detentionFor(3, r)).toBe(0);
    expect(detentionFor(4, r)).toBe(360);
    expect(detentionFor(6, r)).toBe(1080);
    expect(detentionFor(8, r)).toBe(1080 + 2 * 465);
  });

  it("already owed: detention on empties held past free days", () => {
    const b = booking([container({ stage: "EMPTY_PICKED_UP", emptyPickedUpAt: at(-5 * 24) })], 100);
    const e = bookingExposure(b, r, now);
    expect(e.accrued).toBe(720); // 5 days out: days 4 and 5 at $360
    expect(e.atRisk).toBe(0); // no critical exception yet
  });

  it("already owed: export storage on a rolled container stored over 7 days (Subrule 093)", () => {
    const b = booking([container({ stage: "FULL_AT_TERMINAL", emptyPickedUpAt: at(-10 * 24), fullGateInAt: at(-9 * 24), plannedVessel: { id: "V2", name: null } })], 100);
    const storage = bookingExposure(b, r, now).lines.find((l) => l.label.startsWith("Export storage"));
    expect(storage?.amount).toBe(211.28);
    expect(storage?.formula).toContain("Subrule 093");
  });

  it("at risk: only with a critical exception, listing what missing the sailing adds", () => {
    // Cutoff in 10h: one empty out 2 days, one at the terminal 2 days, one at the terminal without VGM
    const b = booking(
      [
        container({ number: "AAAU0000001", stage: "EMPTY_PICKED_UP", emptyPickedUpAt: at(-48) }),
        container({ number: "AAAU0000002", stage: "FULL_AT_TERMINAL", emptyPickedUpAt: at(-72), fullGateInAt: at(-48) }),
        container({ number: "AAAU0000003", stage: "FULL_AT_TERMINAL", emptyPickedUpAt: at(-72), fullGateInAt: at(-48), vgmVerifiedAt: null }),
      ],
      10,
    );
    const e = bookingExposure(b, r, now);
    const amounts = Object.fromEntries(e.lines.map((l) => [l.label, l.amount]));
    // Detention: out 2 days now; 9 days if it waits 7 more: days 4-6 at $360 + days 7-9 at $465
    expect(amounts["More detention: 1 container held 7 more days"]).toBe(3 * 360 + 3 * 465);
    // Two at the terminal would be stored 9 days and leave on another vessel: storage + rehandle each
    expect(amounts["Export storage if rolled: 2 containers at the terminal"]).toBe(2 * 211.28);
    expect(amounts["Rehandling if rolled: 2 containers"]).toBe(2 * 81.61);
    expect(amounts["Weighing at the terminal (no VGM): 1 container"]).toBe(127.39);
    expect(e.atRisk).toBe(Math.round((2475 + 422.56 + 163.22 + 127.39) * 100) / 100);
  });

  it("uses each company's own rates, and totals across bookings", () => {
    const db = openDb(":memory:");
    const acme = new AccountService(db).createOrganization({ name: "Acme Exports", type: "exporter" });
    const rates = new RatesService(db);
    rates.set(acme.id, "detentionFreeDays", 5, null);
    rates.set(acme.id, "missedSailingCost", 2500, null);
    const own = rates.forOrg(acme.id);
    expect(own.detentionFreeDays).toBe(5);
    expect(own.exportStorage).toBe(211.28); // default kept
    const out5 = booking([container({ stage: "EMPTY_PICKED_UP", emptyPickedUpAt: at(-5 * 24) })], 10);
    const e = bookingExposure(out5, own, now);
    expect(e.accrued).toBe(0); // within this company's 5 free days
    expect(e.lines.find((l) => l.label === "Your cost of a missed sailing")?.amount).toBe(2500);
    expect(totalExposure([out5, out5], own, now)).toMatchObject({ accrued: 0, bookings: 2 });
    rates.set(acme.id, "detentionFreeDays", 3, null); // back to the default: override removed
    expect(rates.overrides(acme.id)).toEqual({ missedSailingCost: 2500 });
    expect(() => rates.set(acme.id, "rehandle", -5, null)).toThrow();
  });
});

describe("chassis (S-060)", () => {
  it("isn't counted until a company sets its chassis rate", () => {
    const b = booking([container({ stage: "EMPTY_PICKED_UP", emptyPickedUpAt: at(-48) })], 10);
    expect(bookingExposure(b, r, now).lines.some((l) => l.label.includes("hassis"))).toBe(false);
  });

  it("counts days out past chassis free days, and more days if the sailing is missed", () => {
    const own = { ...r, chassisPerDay: 40, chassisFreeDays: 1 };
    // One container out 2 days (cutoff in 10h, so critical), one delivered after 3 days out
    const b = booking(
      [
        container({ number: "AAAU0000001", stage: "EMPTY_PICKED_UP", emptyPickedUpAt: at(-48) }),
        container({ number: "AAAU0000002", stage: "FULL_AT_TERMINAL", emptyPickedUpAt: at(-96), fullGateInAt: at(-24) }),
      ],
      10,
    );
    const lines = bookingExposure(b, own, now).lines;
    expect(lines.find((l) => l.label.startsWith("Chassis:"))?.amount).toBe((1 + 2) * 40); // 2-1 + 3-1 days
    expect(lines.find((l) => l.label.startsWith("More chassis days"))?.amount).toBe(7 * 40);
  });
});
