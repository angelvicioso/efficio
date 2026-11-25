import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_REFRESH_MINUTES, refreshIntervalMinutes, startScheduler } from "../scheduler";
import { openDb } from "../db";
import { AccountService } from "../auth/accounts";
import { BookingService } from "../bookings";
import { MockPortHoustonAdapter } from "../ports/mock";

afterEach(() => vi.useRealTimers());

describe("refresh interval setting", () => {
  it("defaults to 5 minutes and accepts 0 to turn it off", () => {
    expect(refreshIntervalMinutes({} as unknown as NodeJS.ProcessEnv)).toBe(DEFAULT_REFRESH_MINUTES);
    expect(refreshIntervalMinutes({ REFRESH_INTERVAL_MINUTES: "2" } as unknown as NodeJS.ProcessEnv)).toBe(2);
    expect(refreshIntervalMinutes({ REFRESH_INTERVAL_MINUTES: "0" } as unknown as NodeJS.ProcessEnv)).toBe(0);
    expect(refreshIntervalMinutes({ REFRESH_INTERVAL_MINUTES: "abc" } as unknown as NodeJS.ProcessEnv)).toBe(DEFAULT_REFRESH_MINUTES);
  });
});

describe("scheduler", () => {
  it("runs on the interval and never overlaps runs", async () => {
    vi.useFakeTimers();
    let release: () => void = () => {};
    const run = vi.fn(() => new Promise<void>((r) => (release = r)));
    const logs: string[] = [];
    const s = startScheduler(1000, run, (m) => logs.push(m));
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); // first run still going
    expect(run).toHaveBeenCalledTimes(1);
    expect(logs[0]).toMatch(/skipping/);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    s.stop();
  });

  it("keeps going after a failed run", async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockRejectedValueOnce(new Error("port down")).mockResolvedValue(undefined);
    const logs: string[] = [];
    const s = startScheduler(1000, run, (m) => logs.push(m));
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(logs).toContain("[refresh] failed: port down");
    s.stop();
  });
});

describe("refreshDue", () => {
  it("skips bookings whose vessel sailed more than a day ago", async () => {
    const db = openDb(":memory:");
    const acme = new AccountService(db).createOrganization({ name: "Acme Exports", type: "exporter" });
    const s = new BookingService(db, new MockPortHoustonAdapter());
    await s.add(acme, { carrierCode: "MAEU", bookingNumber: "HOU1002" }); // vessel sails in ~6 days
    await s.add(acme, { carrierCode: "CMDU", bookingNumber: "HOU1004" }); // vessel sails in ~1 day
    expect(await s.refreshDue()).toEqual({ refreshed: 2, skipped: 0 });
    const inThreeDays = new Date(Date.now() + 3 * 86_400_000);
    expect(await s.refreshDue(inThreeDays)).toEqual({ refreshed: 1, skipped: 1 });
  });
});
