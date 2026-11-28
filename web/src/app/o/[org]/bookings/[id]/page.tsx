import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/session";
import { bookingService, ratesService } from "@/lib/service";
import { bookingExposure } from "@/lib/domain/exposure";
import { money } from "@/lib/domain/rates";
import { receivingStatus } from "@/lib/domain/status";
import { diffSnapshots } from "@/lib/domain/changes";
import { CUTOFF_LABELS, TERMINAL_LABELS, vesselPhaseLabel } from "@/lib/domain/types";
import { formatAgo, formatHouston } from "@/lib/format";
import { StatusBadge } from "../../../../StatusBadge";
import { refreshBookingAction, removeBookingAction, removePartyAction, verifyPartyAction } from "../../actions";
import { AccessBadge } from "../../../../AccessBadge";
import { CarrierTrackingLink } from "../../../../CarrierTrackingLink";
import { ExceptionList } from "../../../../ExceptionList";
import { bookingExceptions, worstSeverity } from "@/lib/domain/exceptions";
import { PARTY_ROLE_LABELS } from "@/lib/bookings";
import { carrierName } from "@/lib/domain/carriers";
import { ContainerCounts, ContainerTable } from "../../BookingGroups";
import { containerProgress } from "@/lib/domain/containers";

export const dynamic = "force-dynamic";

export default async function BookingPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params;
  const { org } = await requireOrgAccess(slug);
  const service = bookingService();
  const booking = service.get(org, Number(id));
  if (!booking) notFound();

  const latest = booking.latest;
  const snap = latest?.data ?? null;
  const changes = snap && booking.previous?.data ? diffSnapshots(booking.previous.data, snap) : [];
  const history = service.history(org, booking.id, 10);
  const parties = service.parties(org, booking.id);
  const isCarrier = booking.access.via === "carrier";
  const status = snap ? receivingStatus(snap) : null;
  const rates = org.type === "ocean_carrier" ? null : ratesService().forOrg(org.id);
  const exposure = rates ? bookingExposure(booking, rates) : null;

  return (
    <>
      <p>
        <Link href={`/o/${org.slug}`}>← All bookings</Link>
      </p>

      <section className="hero">
        <div>
          <div className="muted small">{carrierName(booking.carrierCode)} booking</div>
          <h1 className="booking-number">{booking.bookingNumber}</h1>
          <div className="access-line">
            <AccessBadge access={booking.access} />
          </div>
          {latest && (
            <div className="muted small">
              Updated {formatAgo(latest.fetchedAt)} ({formatHouston(latest.fetchedAt)})
            </div>
          )}
        </div>
        <div className="hero-actions">
          {status && <StatusBadge status={status} large />}
          <CarrierTrackingLink carrierCode={booking.carrierCode} bookingNumber={booking.bookingNumber} />
          <form action={refreshBookingAction}>
            <input type="hidden" name="org" value={org.slug} />
            <input type="hidden" name="id" value={booking.id} />
            <button type="submit">Refresh now</button>
          </form>
        </div>
      </section>

      {(() => {
        const ex = bookingExceptions(booking, new Date(), rates ? { detentionFreeDays: rates.detentionFreeDays } : {});
        const sev = worstSeverity(ex);
        return sev ? (
          <section className={`card attention-box attention-box-${sev}`} aria-label="Needs attention">
            <h2>Needs attention</h2>
            <ExceptionList items={ex} />
          </section>
        ) : null;
      })()}

      {exposure && exposure.lines.length > 0 && (
        <section className="card money-card" aria-label="Money at risk">
          <h2>Money at risk</h2>
          <p className="money-line">
            {exposure.atRisk > 0 && (
              <span className="money-risk">
                <strong>{money(exposure.atRisk)}</strong> if this booking misses its sailing
              </span>
            )}
            {exposure.accrued > 0 && (
              <span className="money-owed">
                <strong>{money(exposure.accrued)}</strong> already adding up
              </span>
            )}
          </p>
          <table className="compact money-table">
            <tbody>
              {exposure.lines.map((l) => (
                <tr key={l.label}>
                  <th scope="row">
                    {l.label}
                    <div className="muted small">{l.formula}</div>
                  </th>
                  <td className="num">
                    {money(l.amount)}
                    <div className="small muted">{l.kind === "accrued" ? "adding up now" : "if missed"}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">
            Estimates from <Link href={`/o/${org.slug}/rates`}>your rates</Link> (Port Houston Tariff 14 and carrier defaults). Your
            invoices are what count.
            {rates?.chassisPerDay === 0 && " Chassis isn’t counted yet: add your chassis rate on the Rates page."}
          </p>
        </section>
      )}

      {latest?.error && (
        <div className="callout callout-error" role="alert">
          <strong>Couldn’t get data from the port.</strong> {latest.error}
        </div>
      )}

      {snap && !snap.onFile && (
        <div className="callout">
          <strong>The terminal doesn’t have this booking yet.</strong> This is normal right after the carrier confirms a
          booking: the carrier sends it to the terminal separately. Efficio will keep checking. If it still hasn’t appeared
          close to the vessel’s receiving window, check the booking number with the carrier.
        </div>
      )}

      {changes.length > 0 && (
        <section className="card card-changes">
          <h2>Changed since last update</h2>
          <ul className="changes">
            {changes.map((c) => (
              <li key={c.field}>
                <strong>{c.field}:</strong> {fmtValue(c.before)} → <span className="after">{fmtValue(c.after)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {snap?.onFile && (
        <div className="grid">
          <section className="card">
            <h2>Receiving window</h2>
            <dl>
              <dt>Opens (ERD)</dt>
              <dd>{formatHouston(snap.receivingOpensAt)}</dd>
              <dt>Closes (cargo cutoff)</dt>
              <dd>{formatHouston(snap.cutoffs.find((c) => c.kind === "cargo")?.at)}</dd>
            </dl>
          </section>

          <section className="card">
            <h2>Cutoffs</h2>
            {snap.cutoffs.length === 0 ? (
              <p className="muted">The terminal hasn’t published cutoffs for this vessel yet.</p>
            ) : (
              <table className="compact">
                <tbody>
                  {snap.cutoffs.map((c) => (
                    <tr key={c.kind}>
                      <th scope="row">
                        {CUTOFF_LABELS[c.kind]}
                        <div className="muted small">set by {c.setBy}</div>
                      </th>
                      <td>{formatHouston(c.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted small">Documentation and VGM cutoffs come from the carrier and aren’t shown yet (Q-018).</p>
          </section>

          <section className="card">
            <h2>Vessel &amp; terminal</h2>
            <dl>
              <dt>Terminal</dt>
              <dd>{snap.terminal ? TERMINAL_LABELS[snap.terminal] : "—"}</dd>
              <dt>Vessel / voyage</dt>
              <dd>
                {snap.vesselVisit ? (
                  <>
                    <Link href={`/o/${org.slug}/vessels#vessel-${snap.vesselVisit.id}`}>{snap.vesselVisit.vesselName}</Link> /{" "}
                    {snap.vesselVisit.voyage ?? "—"}
                  </>
                ) : (
                  "—"
                )}
              </dd>
              <dt>Vessel ETA</dt>
              <dd>{formatHouston(snap.vesselVisit?.eta)}</dd>
              <dt>Vessel ETD</dt>
              <dd>{formatHouston(snap.vesselVisit?.etd)}</dd>
              <dt>Carrier</dt>
              <dd>{carrierName(booking.carrierCode)}</dd>
              {snap.vesselProgress?.phase && (
                <>
                  <dt>Vessel status</dt>
                  <dd>{vesselPhaseLabel(snap.vesselProgress.phase)}</dd>
                </>
              )}
              {snap.vesselProgress?.berth && (
                <>
                  <dt>Berth</dt>
                  <dd>{snap.vesselProgress.berth}</dd>
                </>
              )}
              {snap.vesselProgress?.arrivedAt && (
                <>
                  <dt>Arrived</dt>
                  <dd>{formatHouston(snap.vesselProgress.arrivedAt)}</dd>
                </>
              )}
              {snap.vesselProgress?.departedAt && (
                <>
                  <dt>Departed</dt>
                  <dd>{formatHouston(snap.vesselProgress.departedAt)}</dd>
                </>
              )}
            </dl>
            {snap.lateGate && snap.lateGate.length > 0 && (
              <div className="late-gate">
                <div className="small"><strong>Late gate</strong></div>
                <ul className="small">
                  {snap.lateGate.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}

      {snap?.onFile && (
        <section className="card">
          <h2>Containers</h2>
          <div className="section">
            <ContainerCounts p={containerProgress(snap)} />
          </div>
          <ContainerTable snap={snap} />
        </section>
      )}

      {snap && (
        <details className="card">
          <summary>What the port sent (raw data)</summary>
          <pre>{JSON.stringify(snap.raw, null, 2)}</pre>
        </details>
      )}

      <section className="card">
        <h2>{isCarrier ? "Companies on this booking" : "Your access"}</h2>
        {isCarrier ? (
          parties.length === 0 ? (
            <p className="muted">No customers are tracking this booking in Efficio yet.</p>
          ) : (
            <>
              <p className="muted small">
                These companies added this booking themselves. Verify the ones that really are on it, and remove any that
                aren’t. Only you can see this list.
              </p>
              <ul className="plain-list">
                {parties.map((p) => (
                  <li key={p.orgId} className="party-row">
                    <span>
                      <strong>{p.orgName}</strong> <span className="muted small">· {PARTY_ROLE_LABELS[p.role]}</span>{" "}
                      <span className={`pill ${p.status === "verified" ? "pill-verified" : "pill-claimed"}`}>
                        {p.status === "verified" ? "Verified" : "Claimed"}
                      </span>
                    </span>
                    <span className="party-actions">
                      {p.status === "claimed" && (
                        <form action={verifyPartyAction}>
                          <input type="hidden" name="org" value={org.slug} />
                          <input type="hidden" name="id" value={booking.id} />
                          <input type="hidden" name="partyOrgId" value={p.orgId} />
                          <button type="submit" className="secondary small-button">
                            Verify
                          </button>
                        </form>
                      )}
                      <form action={removePartyAction}>
                        <input type="hidden" name="org" value={org.slug} />
                        <input type="hidden" name="id" value={booking.id} />
                        <input type="hidden" name="partyOrgId" value={p.orgId} />
                        <button type="submit" className="link-button">
                          Remove
                        </button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )
        ) : booking.access.status === "claimed" ? (
          <p className="muted">
            You added this booking. Until {carrierName(booking.carrierCode)} confirms you’re on it, you see the
            terminal’s data only. Shared details from the carrier and other parties will appear once it’s verified.
          </p>
        ) : (
          <p className="muted">{carrierName(booking.carrierCode)} confirmed you’re on this booking.</p>
        )}
      </section>

      <section className="card">
        <h2>Update history</h2>
        <ol className="history">
          {history.map((h) => (
            <li key={h.id}>
              {formatHouston(h.fetchedAt)} · {h.source}
              {h.error ? <span className="error-text"> · error</span> : h.data && !h.data.onFile ? " · not on file" : ""}
            </li>
          ))}
        </ol>
      </section>

      {!isCarrier && (
      <form action={removeBookingAction} className="remove">
        <input type="hidden" name="org" value={org.slug} />
        <input type="hidden" name="id" value={booking.id} />
        <button type="submit" className="danger">
          Stop tracking this booking
        </button>
      </form>
      )}
    </>
  );
}

function fmtValue(v: string | null): string {
  if (!v) return "—";
  return /^\d{4}-\d{2}-\d{2}T/.test(v) ? formatHouston(v) : v;
}
