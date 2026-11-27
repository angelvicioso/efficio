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

/**
 * Carrier tracking pages (D-034). `deep` = the booking number goes in the address and the page
 * opens on that booking; otherwise the link opens the carrier's tracking page and the user pastes
 * the number. Only Maersk's format is confirmed (by Eduardo); the rest are to be checked (Q-039).
 */
interface TrackingLink {
  build: (bookingNumber: string) => string;
  deep: boolean;
  confirmed: boolean;
}

const enc = encodeURIComponent;

export const CARRIER_TRACKING: Record<string, TrackingLink> = {
  MAEU: { build: (n) => `https://www.maersk.com/tracking/${enc(n)}`, deep: true, confirmed: true },
  MSCU: { build: (n) => `https://www.msc.com/en/track-a-shipment?agencyPath=msc&trackingNumber=${enc(n)}`, deep: true, confirmed: false },
  CMDU: { build: (n) => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Booking&Reference=${enc(n)}`, deep: true, confirmed: false },
  HLCU: { build: (n) => `https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?blno=${enc(n)}`, deep: true, confirmed: false },
  ONEY: { build: (n) => `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trakNoParam=${enc(n)}`, deep: true, confirmed: false },
  COSU: { build: (n) => `https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=BOOKING&number=${enc(n)}`, deep: true, confirmed: false },
  ZIMU: { build: (n) => `https://www.zim.com/tools/track-a-shipment?consnumber=${enc(n)}`, deep: true, confirmed: false },
  EGLV: { build: () => "https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do", deep: false, confirmed: false },
  OOLU: { build: () => "https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx", deep: false, confirmed: false },
  YMLU: { build: () => "https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx", deep: false, confirmed: false },
  HDMU: { build: () => "https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.do", deep: false, confirmed: false },
};

/** The carrier's tracking link for a booking, or null if we don't know the carrier's site. */
export function carrierTrackingLink(carrierCode: string, bookingNumber: string): { url: string; deep: boolean } | null {
  const t = CARRIER_TRACKING[carrierCode.trim().toUpperCase()];
  return t ? { url: t.build(bookingNumber.trim()), deep: t.deep } : null;
}
