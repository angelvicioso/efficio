import Link from "next/link";
import { requireOrgAccess } from "@/lib/auth/session";
import { bookingService } from "@/lib/service";
import { groupByCarrier } from "@/lib/domain/vessels";
import { carrierName } from "@/lib/domain/carriers";
import { BarLegend, BookingList, GroupStats } from "../BookingGroups";

export const dynamic = "force-dynamic";

export default async function CarriersPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireOrgAccess(slug);
  const carriers = groupByCarrier(bookingService().list(org));

  return (
    <>
      <section className="intro">
        <h1>Carriers</h1>
        <p className="muted">
          Your bookings by carrier, most urgent cutoff first. Click a carrier to see its bookings, and a booking to see its
          containers. Times are Houston time.
        </p>
        <BarLegend />
      </section>

      {carriers.length === 0 && (
        <p className="empty">
          No bookings yet. <Link href={`/o/${org.slug}`}>Track a booking</Link> to get started.
        </p>
      )}

      {carriers.map((c) => (
        <details key={c.carrierCode} id={`carrier-${c.carrierCode}`} className="card group-card">
          <summary>
            <div className="group-head">
              <div>
                <h2 className="group-name">{carrierName(c.carrierCode)}</h2>
                <div className="muted small">
                  {c.carrierCode} · {c.vesselCount} vessel{c.vesselCount === 1 ? "" : "s"}
                </div>
              </div>
              <GroupStats g={c} />
            </div>
          </summary>
          <BookingList org={org.slug} bookings={c.bookings} show="vessel" />
        </details>
      ))}
    </>
  );
}
