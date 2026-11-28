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

describe("hosting helpers", () => {
  it("setup token: open without one, required and exact when set", async () => {
    const { setupTokenRequired, setupTokenValid } = await import("../auth/setupToken");
    const none = {} as unknown as NodeJS.ProcessEnv;
    const set = { EFFICIO_SETUP_TOKEN: "s3cret-token" } as unknown as NodeJS.ProcessEnv;
    expect(setupTokenRequired(none)).toBe(false);
    expect(setupTokenValid(undefined, none)).toBe(true);
    expect(setupTokenRequired(set)).toBe(true);
    expect(setupTokenValid(undefined, set)).toBe(false);
    expect(setupTokenValid("wrong", set)).toBe(false);
    expect(setupTokenValid("s3cret-token", set)).toBe(true);
    // A "+" in the token arrives as a space when it's in the address; copy-paste may add spaces around it
    const plus = { EFFICIO_SETUP_TOKEN: "ab+cd/ef=" } as unknown as NodeJS.ProcessEnv;
    expect(setupTokenValid("ab cd/ef=", plus)).toBe(true);
    expect(setupTokenValid(" ab+cd/ef= ", plus)).toBe(true);
    expect(setupTokenValid("ab cd/eX=", plus)).toBe(false);
  });

  it("public address: explicit setting, then Render, then Codespaces", async () => {
    const { publicBaseUrl } = await import("../publicUrl");
    const env = (o: object) => o as unknown as NodeJS.ProcessEnv;
    expect(publicBaseUrl(env({ RENDER_EXTERNAL_URL: "https://efficio.onrender.com/" }))).toBe("https://efficio.onrender.com");
    expect(publicBaseUrl(env({ EFFICIO_BASE_URL: "https://x.test", RENDER_EXTERNAL_URL: "https://efficio.onrender.com" }))).toBe("https://x.test");
    expect(publicBaseUrl(env({}))).toBeNull();
  });
});

describe("data source setting (D-039)", () => {
  it("reads PORT_ADAPTER forgivingly and reports exactly what it got", async () => {
    const { dataSourceSetting } = await import("../ports");
    const e = (v?: string) => ({ ...(v === undefined ? {} : { PORT_ADAPTER: v }) }) as unknown as NodeJS.ProcessEnv;
    expect(dataSourceSetting(e("navis"))).toEqual({ raw: "navis", kind: "live", recognized: true });
    expect(dataSourceSetting(e(" Navis \n"))).toEqual({ raw: " Navis \n", kind: "live", recognized: true });
    expect(dataSourceSetting(e("live"))).toMatchObject({ kind: "live" });
    expect(dataSourceSetting(e())).toEqual({ raw: null, kind: "simulated", recognized: true });
    expect(dataSourceSetting(e("mock"))).toEqual({ raw: "mock", kind: "simulated", recognized: true });
    expect(dataSourceSetting(e("navsi"))).toEqual({ raw: "navsi", kind: "simulated", recognized: false });
  });
});
