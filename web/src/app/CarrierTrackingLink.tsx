import { carrierName, carrierTrackingLink } from "@/lib/domain/carriers";

/** "Track on Maersk ↗": opens the carrier's own tracking page in a new tab (D-034). */
export function CarrierTrackingLink({ carrierCode, bookingNumber, compact = false }: { carrierCode: string; bookingNumber: string; compact?: boolean }) {
  const link = carrierTrackingLink(carrierCode, bookingNumber);
  if (!link) return null;
  const name = carrierName(carrierCode);
  const label = compact ? `${link.deep ? "Track" : "Tracking site"} ↗` : `${link.deep ? `Track on ${name}` : `${name} tracking site`} ↗`;
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`carrier-link${compact ? " carrier-link-compact" : ""}`}
      title={link.deep ? `Open booking ${bookingNumber} on ${name}'s website` : `Open ${name}'s tracking page, then paste booking ${bookingNumber}`}
    >
      {label}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
