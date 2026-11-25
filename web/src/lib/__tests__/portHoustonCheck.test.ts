import { describe as group, expect, it } from "vitest";
import { describe, mask } from "../../../scripts/port-houston-check";

group("port-houston:check output never shows real values", () => {
  it("masks strings to their pattern", () => {
    expect(mask("MSKU1234565")).toBe('"AAAA9999999"');
    expect(mask("2026-11-25T14:00:00Z")).toBe('"9999-99-99A99:99:99A"');
    expect(mask("Acme Exports Inc")).toBe('"Aaaa Aaaaaaa Aaa"');
    expect(mask(42)).toBe("<integer, 2 digits>");
    expect(mask(1764370800000)).toBe("<integer, 13 digits>");
    expect(mask(null)).toBe("null");
  });

  it("describes nested records by field name with masked values", () => {
    const out = describe({ visitId: "DOB196", lines: [{ lineId: "MAEU", cargoCutoff: "2026-11-28T23:00:00" }], estMoveCount: { estLoad: 12 } }).join("\n");
    expect(out).toContain('visitId: "AAA999"');
    expect(out).toContain('lineId: "AAAA"');
    expect(out).toContain('cargoCutoff: "9999-99-99A99:99:99"');
    expect(out).toContain("estLoad: <integer, 2 digits>");
    expect(out).not.toMatch(/DOB196|MAEU|2026/);
  });
});

group("runPortHoustonCheck", () => {
  it("reports sign-in and each endpoint without real values", async () => {
    const { runPortHoustonCheck } = await import("../ports/navis/check");
    const { EvpClient } = await import("../ports/navis/evpClient");
    const fetchFn = (async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/token")) return new Response(JSON.stringify({ access_token: "t", expires_in: 14400 }));
      if (u.includes("orders/bookings")) return new Response("{}", { status: 403 });
      if (u.includes("vesselvisits")) return new Response(JSON.stringify({ content: [{ vesName: "REAL SHIP", lines: [{ lineId: "MAEU" }] }] }));
      return new Response(JSON.stringify({ content: [] }));
    }) as typeof fetch;
    const client = new EvpClient({ baseUrl: "https://n4.test/v3/evp", tokenUrl: "https://n4.test/token", clientId: "a", clientSecret: "b", operator: "POHA" }, fetchFn);
    const report = (await runPortHoustonCheck(client)).join("\n");
    expect(report).toContain("✓ Signed in");
    expect(report).toContain('vesName: "AAAA AAAA"');
    expect(report).toMatch(/orders\/bookings[\s\S]*✗ EVP orders\/bookings failed \(403\)/);
    expect(report).not.toMatch(/REAL SHIP|MAEU/);
  });

  it("explains missing settings instead of failing", async () => {
    const { runPortHoustonCheck } = await import("../ports/navis/check");
    const saved = { ...process.env };
    for (const k of Object.keys(process.env)) if (k.startsWith("PORT_HOUSTON_EVP_")) delete process.env[k];
    expect((await runPortHoustonCheck()).join("")).toMatch(/Missing Port Houston EVP settings/);
    Object.assign(process.env, saved);
  });
});
