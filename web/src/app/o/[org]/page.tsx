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
import { CarrierTrackingLink } from "../../CarrierTrackingLink";
import { carrierName } from "@/lib/domain/carriers";
import { AddBookingForm } from "./AddBookingForm";
import { refreshAllAction } from "./actions";
import { refreshIntervalMinutes } from "@/lib/scheduler";
import { containerProgress, remainingToPickUp } from "@/lib/domain/containers";
import { parseSort, sortBookings, type SortDir, type SortKey } from "@/lib/domain/sortBookings";
import { ACTION_LABELS, DATE_FIELD_LABELS, DATE_RANGE_LABELS, filterBookings, filterOptions, isFiltered, parseFilters, type BookingFilters } from "@/lib/domain/filterBookings";
import { FilterBar } from "./FilterBar";
import { AttentionPanel } from "./AttentionPanel";
import { ExceptionList } from "../../ExceptionList";
import { bookingExceptions, EXCEPTION_LABELS, exceptionSummary, worstSeverity } from "@/lib/domain/exceptions";

export const dynamic = "force-dynamic";

export default async function OrgBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { org: slug } = await params;
  const { org } = await requireOrgAccess(slug);
  const sp = await searchParams;
  // Default order: most urgent first, so exceptions are always at the top (S-049).
  const parsed = parseSort(sp.sort, sp.dir);
  const sort = parsed.key ? parsed : { key: "attention" as const, dir: "asc" as const };
  const filters = parseFilters(sp);
  const all = bookingService().list(org);
  const bookings = sortBookings(filterBookings(all, filters), sort.key, sort.dir);
  const filtered = isFiltered(filters);
  const header = (key: SortKey, label: string, numeric = false) => (
    <SortHeader key={key} org={org.slug} column={key} label={label} active={sort.key === key} dir={sort.dir} numeric={numeric} filters={filters} />
  );
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
              <code>{num}</code> with {carrierName(s.carrierCode)} ({/^[A-Z][a-z]/.test(s.description) ? s.description.charAt(0).toLowerCase() + s.description.slice(1) : s.description})
            </span>
          ))}
          . Leave the carrier on “Find automatically” and Efficio looks it up. Any other number isn’t at the terminal yet.
        </p>
      )}

      {all.length > 0 && <AttentionPanel org={org.slug} summary={exceptionSummary(all)} active={filters.exception} />}

      {all.length > 0 && (
        <FilterBar
          action={`/o/${org.slug}`}
          values={filters as unknown as Record<string, string>}
          options={{
            ...filterOptions(all),
            actions: Object.entries(ACTION_LABELS),
            exceptions: [["any", "Any exception"], ...Object.entries(EXCEPTION_LABELS).map(([k, v]) => [k, v.label] as [string, string])],
            dateFields: Object.entries(DATE_FIELD_LABELS),
            ranges: Object.entries(DATE_RANGE_LABELS),
          }}
          sort={sort.key}
          dir={sort.dir}
          filtered={filtered}
        />
      )}

      {all.length === 0 ? (
        <p className="empty">No bookings tracked yet. Add a booking number above to start.</p>
      ) : bookings.length === 0 ? (
        <p className="empty">
          No bookings match these filters. <a href={`/o/${org.slug}`}>Clear filters</a>
        </p>
      ) : (
        <section>
          <div className="list-header">
            <div>
              <h2>{filtered ? `Showing ${bookings.length} of ${all.length} bookings` : `Tracked bookings (${all.length})`}</h2>
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
            <table className="bookings-table">
              <thead>
                <tr>
                  {header("attention", "Attention")}
                  {header("booking", "Booking")}
                  {header("carrier", "Carrier")}
                  {header("status", "Status")}
                  {header("containers", "Containers", true)}
                  {header("pickedUp", "Picked up", true)}
                  {header("atTerminal", "At terminal", true)}
                  {header("opens", "Receiving opens")}
                  {header("cutoff", "Cargo cutoff")}
                  {header("updated", "Updated")}
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const snap = b.latest?.data;
                  const changes = snap && b.previous?.data ? diffSnapshots(b.previous.data, snap) : [];
                  const p = snap?.onFile ? containerProgress(snap) : null;
                  const notYet = p ? remainingToPickUp(p) : 0;
                  const exceptions = bookingExceptions(b);
                  const severity = worstSeverity(exceptions);
                  return (
                    <tr key={b.id} className={severity ? `row-${severity}` : undefined}>
                      <td className="attention-cell">
                        <ExceptionList items={exceptions} compact />
                      </td>
                      <td>
                        <Link href={`/o/${org.slug}/bookings/${b.id}`} className="booking-link">
                          {b.bookingNumber}
                        </Link>
                        {snap?.terminal && <div className="muted small">{TERMINAL_LABELS[snap.terminal]}</div>}
                      </td>
                      <td>
                        {carrierName(b.carrierCode)}
                        <div>
                          <CarrierTrackingLink carrierCode={b.carrierCode} bookingNumber={b.bookingNumber} compact />
                        </div>
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
                      <td className="num">{p ? p.booked : "—"}</td>
                      <td className="num">
                        {p ? p.pickedUp : "—"}
                        {notYet > 0 && <div className="to-pick-up small">{notYet} not yet</div>}
                      </td>
                      <td className="num">{p ? p.atTerminal : "—"}</td>
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

/** A column header that sorts the list: first tap ascending, second tap descending. */
function SortHeader({
  org,
  column,
  label,
  active,
  dir,
  numeric,
  filters,
}: {
  org: string;
  column: SortKey;
  label: string;
  active: boolean;
  dir: SortDir;
  numeric: boolean;
  filters: BookingFilters;
}) {
  const next: SortDir = active && dir === "asc" ? "desc" : "asc";
  // Keep the current filters when changing the sort.
  const params = new URLSearchParams({ sort: column, dir: next });
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  return (
    <th aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={numeric ? "num" : undefined}>
      <Link href={`/o/${org}?${params}`} className={`sort-link${active ? " sort-active" : ""}`} scroll={false}>
        {label}
        <span aria-hidden="true" className="sort-arrow">
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </Link>
    </th>
  );
}
