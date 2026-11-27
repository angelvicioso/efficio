import Link from "next/link";
import { requireOrgAccess } from "@/lib/auth/session";
import { bookingService } from "@/lib/service";
import { cargoCutoff, receivingStatus } from "@/lib/domain/status";
import { diffSnapshots } from "@/lib/domain/changes";
import { TERMINAL_LABELS } from "@/lib/domain/types";
import { formatAgo, formatHouston } from "@/lib/format";
import { MOCK_SCENARIOS } from "@/lib/ports/mock";
import { getPortAdapter } from "@/lib/ports";
import { StatusBadge } from "../../StatusBadge";
import { AccessBadge } from "../../AccessBadge";
import { carrierName } from "@/lib/domain/carriers";
import { AddBookingForm } from "./AddBookingForm";
import { refreshAllAction } from "./actions";
import { refreshIntervalMinutes } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export default async function OrgBookingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireOrgAccess(slug);
  const bookings = bookingService().list(org);
  const isCarrier = org.type === "ocean_carrier";
  const refreshMinutes = refreshIntervalMinutes();
  const isMock = getPortAdapter().source === "mock";

  return (
    <>
      <section className="intro">
        <h1>{isCarrier ? `${carrierName(org.carrierCode)} bookings at Port Houston` : "Bookings at Port Houston"}</h1>
        <p className="muted">
          {isCarrier
            ? "Every booking under your carrier code that a customer is tracking, plus any you add. "
            : "Receiving windows and cutoffs as the terminal reports them. "}
          Times are Houston time.
        </p>
      </section>

      <AddBookingForm org={org.slug} fixedCarrier={isCarrier ? org.carrierCode : null} />

      {isMock && (
        <p className="hint">
          Simulated data. Try:{" "}
          {Object.entries(MOCK_SCENARIOS).map(([num, s], i) => (
            <span key={num}>
              {i > 0 && ", "}
              <code>{num}</code> with {carrierName(s.carrierCode)} ({s.description.toLowerCase()})
            </span>
          ))}
          . Leave the carrier on “Find automatically” and Efficio looks it up. Any other number isn’t at the terminal yet.
        </p>
      )}

      {bookings.length === 0 ? (
        <p className="empty">No bookings tracked yet. Add a booking number above to start.</p>
      ) : (
        <section>
          <div className="list-header">
            <div>
              <h2>Tracked bookings ({bookings.length})</h2>
              <p className="muted small no-margin">
                {refreshMinutes > 0
                  ? `Updates automatically every ${refreshMinutes} minute${refreshMinutes === 1 ? "" : "s"}.`
                  : "Automatic updates are off."}
              </p>
            </div>
            <form action={refreshAllAction}>
              <input type="hidden" name="org" value={org.slug} />
              <button type="submit" className="secondary">
                Refresh all
              </button>
            </form>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Carrier</th>
                  <th>Status</th>
                  <th>Receiving opens</th>
                  <th>Cargo cutoff</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const snap = b.latest?.data;
                  const changes = snap && b.previous?.data ? diffSnapshots(b.previous.data, snap) : [];
                  return (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/o/${org.slug}/bookings/${b.id}`} className="booking-link">
                          {b.bookingNumber}
                        </Link>
                        {snap?.terminal && <div className="muted small">{TERMINAL_LABELS[snap.terminal]}</div>}
                      </td>
                      <td>
                        {carrierName(b.carrierCode)}
                        <div>
                          <AccessBadge access={b.access} />
                        </div>
                      </td>
                      <td>
                        {snap ? (
                          <StatusBadge status={receivingStatus(snap)} />
                        ) : (
                          <span className="badge badge-error">Couldn’t reach port</span>
                        )}
                        {changes.length > 0 && (
                          <div className="changed small">
                            {changes.length} change{changes.length > 1 ? "s" : ""} since last update
                          </div>
                        )}
                      </td>
                      <td>{formatHouston(snap?.receivingOpensAt)}</td>
                      <td>{formatHouston(snap ? cargoCutoff(snap) : null)}</td>
                      <td className="muted">{b.latest ? formatAgo(b.latest.fetchedAt) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
