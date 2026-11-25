/**
 * Ocean carriers exporters can choose when adding a booking (D-015).
 * Codes are SCAC (Standard Carrier Alpha Codes). A starter list of major lines; Orlando to confirm
 * which carriers call Port Houston (Q-031).
 */
export const CARRIERS: Record<string, string> = {
  MAEU: "Maersk",
  MSCU: "MSC",
  CMDU: "CMA CGM",
  HLCU: "Hapag-Lloyd",
  ONEY: "ONE (Ocean Network Express)",
  COSU: "COSCO",
  EGLV: "Evergreen",
  OOLU: "OOCL",
  YMLU: "Yang Ming",
  HDMU: "HMM",
  ZIMU: "ZIM",
};

export function carrierName(code: string | null | undefined): string {
  if (!code) return "—";
  return CARRIERS[code] ?? code;
}

export function isKnownCarrier(code: string): boolean {
  return code in CARRIERS;
}
