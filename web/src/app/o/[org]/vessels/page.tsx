import Link from "next/link";
import { requireOrgAccess } from "@/lib/auth/session";
import { bookingService } from "@/lib/service";
import { groupByVessel } from "@/lib/domain/vessels";
import { cargoCutoff, receivingStatus, type ReceivingState } from "@/lib/domain/status";
import { carrierName } from "@/lib/domain/carriers";
import { TERMINAL_LABELS } from "@/lib/domain/types";
import { formatHouston } from "@/lib/format";
import { StatusBadge } from "../../../StatusBadge";
import { AccessBadge } from "../../../AccessBadge";

export const dynamic = "force-dynamic";

const STATE_WORDS: [ReceivingState, string][] = [
  ["CLOSING_SOON", "closing soon"],
  ["OPEN", "open"],
  ["NOT_OPEN", "not open yet"],
  ["CLOSED", "closed"],
  ["DATES_PENDING", "dates pending"],
];

export default async function VesselsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireOrgAccess(slug);
  const { vessels, unassigned } = groupByVessel(bookingService().list(org));

  return (
    <>
      <section className="intro">
        <h1>Vessels</h1>
        <p className="muted">Your bookings grouped by the vessel they’re on, soonest departure first. Times are Houston time.</p>
      </section>

      {vessels.length === 0 && unassigned.length === 0 && (
        <p className="empty">
          No bookings yet. <Link href={`/o/${org.slug}`}>Track a booking</Link> and it will show up under its vessel.
        </p>
      )}

      {vessels.map((v) => (
        <section key={v.visitId} id={`vessel-${v.visitId}`} className="card vessel-card">
          <div className="vessel-head">
            <div>
              <h2 className="vessel-name">{v.vesselName}</h2>
              <div className="muted small">
                {v.terminal ? TERMINAL_LABELS[v.terminal] : "Terminal not reported"} · Arrives {formatHouston(v.eta)} · Departs{" "}
                {formatHouston(v.etd)}
              </div>
            </div>
            <div className="vessel-summary">
              <div className="vessel-count">
                {v.bookings.length} booking{v.bookings.length === 1 ? "" : "s"}
              </div>
              <div className="muted small">
                {STATE_WORDS.filter(([s]) => v.stateCounts[s])
                  .map(([s, w]) => `${v.stateCounts[s]} ${w}`)
                  .join(" · ")}
              </div>
            </div>
          </div>

          {v.nextCutoff && (
            <p className="next-cutoff">
              Next cargo cutoff: <strong>{formatHouston(v.nextCutoff.at)}</strong> for {v.nextCutoff.booking.bookingNumber} (
              {carrierName(v.nextCutoff.booking.carrierCode)}){" "}
              <StatusBadge status={receivingStatus(v.nextCutoff.booking.latest!.data!)} />
            </p>
          )}

          <div className="table-wrap flat">
            <table>
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Carrier / voyage</th>
                  <th>Status</th>
                  <th>Receiving opens</th>
                  <th>Cargo cutoff</th>
                </tr>
              </thead>
              <tbody>
                {v.bookings.map((b) => {
                  const snap = b.latest!.data!;
                  return (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/o/${org.slug}/bookings/${b.id}`} className="booking-link">
                          {b.bookingNumber}
                        </Link>
                        <div>
                          <AccessBadge access={b.access} />
                        </div>
                      </td>
                      <td>
                        {carrierName(b.carrierCode)}
                        <div className="muted small">{snap.vesselVisit?.voyage ?? "—"}</div>
                      </td>
                      <td>
                        <StatusBadge status={receivingStatus(snap)} />
                      </td>
                      <td>{formatHouston(snap.receivingOpensAt)}</td>
                      <td>{formatHouston(cargoCutoff(snap))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {unassigned.length > 0 && (
        <section className="card">
          <h2>Not on a vessel yet ({unassigned.length})</h2>
          <p className="muted small">The terminal hasn’t linked these bookings to a vessel yet, usually because it doesn’t have them on file.</p>
          <ul className="plain-list">
            {unassigned.map((b) => (
              <li key={b.id}>
                <Link href={`/o/${org.slug}/bookings/${b.id}`} className="booking-link">
                  {b.bookingNumber}
                </Link>{" "}
                <span className="muted small">· {carrierName(b.carrierCode)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
