import Link from "next/link";
import { requireOrgAccess } from "@/lib/auth/session";
import { bookingService } from "@/lib/service";
import { groupByVessel } from "@/lib/domain/vessels";
import { carrierName } from "@/lib/domain/carriers";
import { TERMINAL_LABELS } from "@/lib/domain/types";
import { formatHouston } from "@/lib/format";
import { BarLegend, BookingList, GroupStats } from "../BookingGroups";

export const dynamic = "force-dynamic";

export default async function VesselsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireOrgAccess(slug);
  const { vessels, unassigned } = groupByVessel(bookingService().list(org));

  return (
    <>
      <section className="intro">
        <h1>Vessels</h1>
        <p className="muted">
          Your bookings by vessel, soonest departure first. Click a vessel to see its bookings, and a booking to see its
          containers. Times are Houston time.
        </p>
        <BarLegend />
      </section>

      {vessels.length === 0 && unassigned.length === 0 && (
        <p className="empty">
          No bookings yet. <Link href={`/o/${org.slug}`}>Track a booking</Link> and it will show up under its vessel.
        </p>
      )}

      {vessels.map((v) => (
        <details key={v.visitId} id={`vessel-${v.visitId}`} className="card group-card">
          <summary>
            <div className="group-head">
              <div>
                <h2 className="group-name">{v.vesselName}</h2>
                <div className="muted small">
                  {v.terminal ? TERMINAL_LABELS[v.terminal] : "Terminal not reported"} · Arrives {formatHouston(v.eta)} · Departs{" "}
                  {formatHouston(v.etd)}
                </div>
                <div className="muted small">
                  Carriers: {[...new Set(v.bookings.map((b) => carrierName(b.carrierCode)))].join(", ")}
                </div>
              </div>
              <GroupStats g={v} />
            </div>
          </summary>
          <BookingList org={org.slug} bookings={v.bookings} show="carrier" />
        </details>
      ))}

      {unassigned.length > 0 && (
        <details className="card group-card">
          <summary>
            <div className="group-head">
              <div>
                <h2 className="group-name">Not on a vessel yet</h2>
                <div className="muted small">The terminal hasn’t linked these bookings to a vessel, usually because it doesn’t have them on file yet.</div>
              </div>
              <div className="group-count">
                {unassigned.length} booking{unassigned.length === 1 ? "" : "s"}
              </div>
            </div>
          </summary>
          <BookingList org={org.slug} bookings={unassigned} show="carrier" />
        </details>
      )}
    </>
  );
}
