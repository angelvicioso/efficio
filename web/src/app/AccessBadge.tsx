import type { BookingAccess } from "@/lib/bookings";

/** How this organization is on the booking (P-001). */
export function AccessBadge({ access }: { access: BookingAccess }) {
  if (access.via === "carrier") return <span className="pill pill-verified">Your booking (carrier)</span>;
  return access.status === "verified" ? (
    <span className="pill pill-verified" title="The carrier confirmed you're on this booking">
      Verified by carrier
    </span>
  ) : (
    <span className="pill pill-claimed" title="You added this booking; the carrier hasn't confirmed it yet">
      Claimed
    </span>
  );
}
