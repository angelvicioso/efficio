import { describe, expect, it } from "vitest";
import { CARRIER_TRACKING, carrierTrackingLink } from "../domain/carriers";

describe("carrier tracking links (D-034)", () => {
  it("builds Maersk's confirmed format", () => {
    expect(carrierTrackingLink("MAEU", "721816224")).toEqual({ url: "https://www.maersk.com/tracking/721816224", deep: true });
  });

  it("puts the booking number into the link safely", () => {
    expect(carrierTrackingLink("mscu", " 038NY1578254 ")!.url).toContain("trackingNumber=038NY1578254");
    expect(carrierTrackingLink("MAEU", "A/B?C")!.url).toBe("https://www.maersk.com/tracking/A%2FB%3FC");
  });

  it("falls back to the tracking page for carriers without deep links, and null for unknown carriers", () => {
    expect(carrierTrackingLink("EGLV", "X1")).toMatchObject({ deep: false });
    expect(carrierTrackingLink("SMLU", "X1")).toBeNull();
  });

  it("only uses https links", () => {
    for (const [code, t] of Object.entries(CARRIER_TRACKING)) expect(t.build("TEST123"), code).toMatch(/^https:\/\//);
  });
});
