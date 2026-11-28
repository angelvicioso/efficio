import { describe, expect, it } from "vitest";
import type { TrackedBooking } from "../bookings";
import type { PortBookingSnapshot, Container } from "../domain/types";
import { attentionRank, bookingExceptions, exceptionSummary, worstSeverity } from "../domain/exceptions";

const now = new Date("2026-12-01T12:00:00Z");
const H = 3_600_000;
const at = (offsetH: number) => new Date(now.getTime() + offsetH * H).toISOString();

function booking(o: {
  cutoffInH?: number | null;
  booked?: number;
  pickedUp?: number;
  delivered?: number;
  etdInH?: number | null;
  prevCutoffInH?: number;
  onFile?: boolean;
  error?: boolean;
  extras?: Record<number, Partial<Container>>;
  prevEtdInH?: number;
}): TrackedBooking {
  const containers: Container[] = Array.from({ length: o.pickedUp ?? 0 }, (_, i) => ({
    number: `TEST${String(i).padStart(7, "0")}`,
    sizeType: "45G1",
    stage: i < (o.delivered ?? 0) ? "FULL_AT_TERMINAL" : "EMPTY_PICKED_UP",
    emptyPickedUpAt: at(-48),
    fullGateInAt: null,
    loadedAt: null,
    ...(o.extras?.[i] ?? {}),
  }));
  const snap = (cutoffH: number | null | undefined): PortBookingSnapshot => ({
    source: "test",
    bookingNumber: "B1",
    onFile: o.onFile ?? true,
    terminal: "BAYPORT",
    carrierCode: "MAEU",
    vesselVisit: { id: "V1", vesselName: "SHIP", voyage: "1", eta: null, etd: o.etdInH === null ? null : at(o.etdInH ?? 72) },
    receivingOpensAt: at(-72),
    cutoffs: cutoffH === null || cutoffH === undefined ? [] : [{ kind: "cargo", at: at(cutoffH), setBy: "terminal" }],
    equipment: [{ sizeType: "45G1", quantity: o.booked ?? 0 }],
    containers,
    raw: null,
    fetchedAt: now.toISOString(),
  });
  return {
    id: 1,
    carrierCode: "MAEU",
    bookingNumber: "B1",
    createdAt: at(-100),
    access: { role: "exporter", status: "claimed", via: "party", since: 0 },
    latest: { id: 2, fetchedAt: now.toISOString(), source: "test", data: o.error ? null : snap(o.cutoffInH), error: o.error ? "port down" : null },
    previous:
      o.prevCutoffInH === undefined && o.prevEtdInH === undefined
        ? null
        : {
            id: 1,
            fetchedAt: at(-1),
            source: "test",
            data: (() => {
              const p = snap(o.prevCutoffInH ?? o.cutoffInH);
              if (o.prevEtdInH !== undefined) p.vesselVisit = { ...p.vesselVisit!, etd: at(o.prevEtdInH) };
              return p;
            })(),
            error: null,
          },
  };
}
const kinds = (b: TrackedBooking) => bookingExceptions(b, now).map((e) => e.kind);

describe("exceptions (S-049): 1 day before cutoff", () => {
  it("flags empties not picked up and containers not delivered within 24h of cutoff, with specifics", () => {
    const e = bookingExceptions(booking({ cutoffInH: 18, booked: 6, pickedUp: 4, delivered: 1 }), now);
    expect(e).toEqual([
      { kind: "EMPTIES_NOT_PICKED_UP", severity: "critical", title: "2 of 6 empties not picked up", detail: "cutoff in 18h" },
      { kind: "NOT_DELIVERED", severity: "critical", title: "5 of 6 not delivered to the terminal", detail: "cutoff in 18h" },
    ]);
  });

  it("stays quiet more than 24h before cutoff, and when everything is delivered", () => {
    expect(kinds(booking({ cutoffInH: 30, booked: 6, pickedUp: 0 }))).toEqual([]);
    expect(kinds(booking({ cutoffInH: 5, booked: 2, pickedUp: 2, delivered: 2 }))).toEqual([]);
  });

  it("only flags what's actually missing", () => {
    expect(kinds(booking({ cutoffInH: 10, booked: 3, pickedUp: 3, delivered: 1 }))).toEqual(["NOT_DELIVERED"]);
  });

  it("flags a passed cutoff with containers missing, until the vessel sails", () => {
    const e = bookingExceptions(booking({ cutoffInH: -5, booked: 5, pickedUp: 5, delivered: 4, etdInH: 20 }), now)[0];
    expect(e).toMatchObject({ kind: "CUTOFF_PASSED_NOT_DELIVERED", title: "1 of 5 missed the cargo cutoff", detail: "cutoff was 5h ago; risk of being rolled" });
    expect(kinds(booking({ cutoffInH: -30, booked: 5, pickedUp: 5, delivered: 4, etdInH: -2 }))).toEqual([]); // vessel already sailed
  });

  it("warns when the cutoff moved earlier", () => {
    const e = bookingExceptions(booking({ cutoffInH: 60, prevCutoffInH: 72, booked: 0 }), now);
    expect(e).toEqual([{ kind: "CUTOFF_MOVED_EARLIER", severity: "warning", title: "Cutoff moved 12h earlier", detail: "now in 2d 12h" }]);
    expect(kinds(booking({ cutoffInH: 72, prevCutoffInH: 60, booked: 0 }))).toEqual([]); // moved later: fine
  });

  it("warns when the port couldn't be reached; ignores bookings not at the terminal", () => {
    expect(kinds(booking({ error: true }))).toEqual(["NO_UPDATE"]);
    expect(kinds(booking({ onFile: false, cutoffInH: 5, booked: 3 }))).toEqual([]);
  });

  it("summarizes, ranks critical first, and reports the worst severity", () => {
    const critical = booking({ cutoffInH: 10, booked: 2, pickedUp: 0 });
    const warning = booking({ error: true });
    const fine = booking({ cutoffInH: 100, booked: 2 });
    expect(exceptionSummary([critical, warning, fine], now)).toEqual([
      { kind: "EMPTIES_NOT_PICKED_UP", count: 1 },
      { kind: "NOT_DELIVERED", count: 1 },
      { kind: "NO_UPDATE", count: 1 },
    ]);
    expect(attentionRank(critical, now)).toBeLessThan(attentionRank(warning, now));
    expect(attentionRank(warning, now)).toBeLessThan(attentionRank(fine, now));
    expect(worstSeverity(bookingExceptions(warning, now))).toBe("warning");
  });
});

describe("more exceptions (S-051, S-052, S-054, S-056, S-058)", () => {
  it("rolled: a container planned on a different vessel", () => {
    const e = bookingExceptions(booking({ cutoffInH: 80, booked: 2, pickedUp: 2, delivered: 2, extras: { 0: { plannedVessel: { id: "V2", name: "SHIP / 2" } } } }), now);
    expect(e).toEqual([expect.objectContaining({ kind: "ROLLED", severity: "critical", title: "1 container moved to another vessel", detail: "TEST0000000 now planned on SHIP / 2" })]);
    expect(kinds(booking({ cutoffInH: 80, booked: 1, pickedUp: 1, delivered: 1, extras: { 0: { plannedVessel: { id: "V1", name: null } } } }))).toEqual([]);
  });

  it("holds: a warning days ahead, critical within 24h of cutoff", () => {
    const early = bookingExceptions(booking({ cutoffInH: 80, booked: 1, pickedUp: 1, delivered: 1, extras: { 0: { holds: ["Customs exam"] } } }), now);
    expect(early).toEqual([expect.objectContaining({ kind: "ON_HOLD", severity: "warning", title: "1 container on hold (Customs exam)" })]);
    const late = bookingExceptions(booking({ cutoffInH: 10, booked: 1, pickedUp: 1, delivered: 1, extras: { 0: { holds: ["Customs exam"] } } }), now);
    expect(late.find((x) => x.kind === "ON_HOLD")?.severity).toBe("critical");
  });

  it("VGM: only flags delivered containers explicitly without VGM, within 24h", () => {
    expect(kinds(booking({ cutoffInH: 10, booked: 2, pickedUp: 2, delivered: 2, extras: { 0: { vgmVerifiedAt: null } } }))).toEqual(["VGM_MISSING"]);
    expect(kinds(booking({ cutoffInH: 10, booked: 2, pickedUp: 2, delivered: 2 }))).toEqual([]); // VGM not reported: no alarm
    expect(kinds(booking({ cutoffInH: 40, booked: 2, pickedUp: 2, delivered: 2, extras: { 0: { vgmVerifiedAt: null } } }))).toEqual([]); // too early
  });

  it("storage: warning within 24h of free time ending, critical after", () => {
    const soon = bookingExceptions(booking({ cutoffInH: 80, booked: 1, pickedUp: 1, delivered: 1, extras: { 0: { lastFreeDay: at(10) } } }), now);
    expect(soon).toEqual([expect.objectContaining({ kind: "STORAGE", severity: "warning", title: "Free time ends for 1 container", detail: "in 10h" })]);
    const over = bookingExceptions(booking({ cutoffInH: 80, booked: 1, pickedUp: 1, delivered: 1, extras: { 0: { lastFreeDay: at(-30) } } }), now);
    expect(over).toEqual([expect.objectContaining({ kind: "STORAGE", severity: "critical", title: "1 container past free time", detail: "storage charges for 1d 6h" })]);
  });

  it("vessel schedule: departure moved by an hour or more", () => {
    const e = bookingExceptions(booking({ cutoffInH: 80, booked: 0, etdInH: 120, prevEtdInH: 96 }), now);
    expect(e).toEqual([expect.objectContaining({ kind: "VESSEL_SCHEDULE_CHANGED", severity: "warning", title: "Vessel departure moved 1d later" })]);
    expect(kinds(booking({ cutoffInH: 80, booked: 0, etdInH: 96, prevEtdInH: 96 }))).toEqual([]);
  });
});
