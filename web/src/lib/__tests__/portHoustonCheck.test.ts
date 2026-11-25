import { describe as group, expect, it } from "vitest";
import { describe, mask } from "../../../scripts/port-houston-check";

group("port-houston:check output never shows real values", () => {
  it("masks strings to their pattern", () => {
    expect(mask("MSKU1234565")).toBe('"AAAA9999999"');
    expect(mask("2026-11-25T14:00:00Z")).toBe('"9999-99-99A99:99:99A"');
    expect(mask("Acme Exports Inc")).toBe('"Aaaa Aaaaaaa Aaa"');
    expect(mask(42)).toBe("<integer>");
    expect(mask(null)).toBe("null");
  });

  it("describes nested records by field name with masked values", () => {
    const out = describe({ visitId: "DOB196", lines: [{ lineId: "MAEU", cargoCutoff: "2026-11-28T23:00:00" }], estMoveCount: { estLoad: 12 } }).join("\n");
    expect(out).toContain('visitId: "AAA999"');
    expect(out).toContain('lineId: "AAAA"');
    expect(out).toContain('cargoCutoff: "9999-99-99A99:99:99"');
    expect(out).toContain("estLoad: <integer>");
    expect(out).not.toMatch(/DOB196|MAEU|2026/);
  });
});
