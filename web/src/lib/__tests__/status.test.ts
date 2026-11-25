import { describe, expect, it } from "vitest";
import { formatDuration, receivingStatus } from "../domain/status";
import type { PortBookingSnapshot } from "../domain/types";

const now = new Date("2026-12-01T12:00:00Z");
const HOUR = 3600_000;

function snap(opens: number | null, cutoff: number | null, onFile = true): PortBookingSnapshot {
  return {
    source: "test",
    bookingNumber: "B1",
    onFile,
    terminal: "BAYPORT",
    carrierCode: null,
    vesselVisit: null,
    receivingOpensAt: opens === null ? null : new Date(now.getTime() + opens).toISOString(),
    cutoffs: cutoff === null ? [] : [{ kind: "cargo", at: new Date(now.getTime() + cutoff).toISOString(), setBy: "terminal" }],
    raw: null,
    fetchedAt: now.toISOString(),
  };
}

describe("receivingStatus", () => {
  it("is NOT_ON_FILE when the terminal has no booking", () => {
    expect(receivingStatus(snap(null, null, false), now).state).toBe("NOT_ON_FILE");
  });
  it("is NOT_OPEN before ERD", () => {
    const s = receivingStatus(snap(5 * HOUR, 100 * HOUR), now);
    expect(s.state).toBe("NOT_OPEN");
    expect(s.label).toBe("Opens in 5h");
  });
  it("is OPEN between ERD and cutoff, more than 48h out", () => {
    expect(receivingStatus(snap(-HOUR, 72 * HOUR), now).state).toBe("OPEN");
  });
  it("is CLOSING_SOON within 48h of cutoff", () => {
    expect(receivingStatus(snap(-HOUR, 47 * HOUR), now).state).toBe("CLOSING_SOON");
  });
  it("is CLOSED at or after cutoff", () => {
    expect(receivingStatus(snap(-48 * HOUR, 0), now).state).toBe("CLOSED");
  });
  it("is DATES_PENDING when on file without dates", () => {
    expect(receivingStatus(snap(null, null), now).state).toBe("DATES_PENDING");
  });
  it("treats a missing ERD with a future cutoff as open", () => {
    expect(receivingStatus(snap(null, 72 * HOUR), now).state).toBe("OPEN");
  });
});

describe("formatDuration", () => {
  it("formats days, hours and minutes", () => {
    expect(formatDuration(26 * HOUR)).toBe("1d 2h");
    expect(formatDuration(3 * HOUR + 15 * 60_000)).toBe("3h 15m");
    expect(formatDuration(5 * 60_000)).toBe("5m");
    expect(formatDuration(-1)).toBe("0m");
  });
});
