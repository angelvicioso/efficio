import Link from "next/link";
import type { TrackedBooking } from "@/lib/bookings";
import { containerProgress, remainingToDeliver, type ContainerProgress } from "@/lib/domain/containers";
import { carrierName } from "@/lib/domain/carriers";
import { cargoCutoff, receivingStatus, type ReceivingState } from "@/lib/domain/status";
import { CONTAINER_STAGE_LABELS, sizeTypeLabel } from "@/lib/domain/types";
import type { GroupSummary } from "@/lib/domain/vessels";
import { formatHouston } from "@/lib/format";
import { AccessBadge } from "../../AccessBadge";
import { StatusBadge } from "../../StatusBadge";

/** Shared pieces of the Vessels and Carriers views: group header, bookings, containers. */

const STATE_WORDS: [ReceivingState, string][] = [
  ["CLOSING_SOON", "closing soon"],
  ["OPEN", "open"],
  ["NOT_OPEN", "not open yet"],
  ["CLOSED", "closed"],
  ["DATES_PENDING", "dates pending"],
  ["NOT_ON_FILE", "not at terminal yet"],
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function stateSummary(counts: GroupSummary["stateCounts"]): string {
  return STATE_WORDS.filter(([s]) => counts[s])
    .map(([s, w]) => `${counts[s]} ${w}`)
    .join(" · ");
}

/** "12 containers · 9 picked up · 5 at terminal · 0 on vessel", with a stacked bar. */
export function ContainerCounts({ p, compact = false }: { p: ContainerProgress; compact?: boolean }) {
  if (p.booked === 0) return <span className="muted small">No container data</span>;
  const pct = (n: number) => `${(n / p.booked) * 100}%`;
  const left = remainingToDeliver(p);
  return (
    <div className={compact ? "counts counts-compact" : "counts"}>
      <div className="counts-text">
        <strong>{plural(p.booked, "container")}</strong>
        <span className="muted"> · {p.pickedUp} picked up · {p.atTerminal} at terminal · {p.loaded} on vessel</span>
      </div>
      <div
        className="bar"
        role="img"
        aria-label={`${p.pickedUp} of ${p.booked} picked up, ${p.atTerminal} at terminal, ${p.loaded} on vessel`}
      >
        <span className="bar-out" style={{ width: pct(p.pickedUp) }} />
        <span className="bar-in" style={{ width: pct(p.atTerminal) }} />
        <span className="bar-loaded" style={{ width: pct(p.loaded) }} />
      </div>
      {!compact && left > 0 && <div className="small counts-left">{plural(left, "container")} still to deliver to the terminal</div>}
    </div>
  );
}

export function BarLegend() {
  return (
    <p className="legend small muted">
      <span className="swatch bar-out" /> Picked up empty <span className="swatch bar-in" /> Loaded, at terminal{" "}
      <span className="swatch bar-loaded" /> On vessel
    </p>
  );
}

/** Group header line: N bookings, container counts, next cutoff. */
export function GroupStats({ g }: { g: GroupSummary }) {
  return (
    <div className="group-stats">
      <div className="group-count">
        {plural(g.bookings.length, "booking")}
        <span className="muted small"> · {stateSummary(g.stateCounts)}</span>
      </div>
      <ContainerCounts p={g.containers} />
      {g.nextCutoff && (
        <div className="small">
          Next cargo cutoff <strong>{formatHouston(g.nextCutoff.at)}</strong> ({g.nextCutoff.booking.bookingNumber})
        </div>
      )}
    </div>
  );
}

/** Each booking collapses to one line and expands to its containers. */
export function BookingList({
  org,
  bookings,
  show,
}: {
  org: string;
  bookings: TrackedBooking[];
  /** The view's grouping is already known, so show the other dimension on each line. */
  show: "carrier" | "vessel";
}) {
  return (
    <div className="booking-list">
      {bookings.map((b) => {
        const snap = b.latest?.data ?? null;
        const p = containerProgress(snap);
        return (
          <details key={b.id} className="booking-item">
            <summary>
              <span className="bi-main">
                <span className="booking-link-text">{b.bookingNumber}</span>
                <span className="muted small">
                  {show === "carrier"
                    ? `${carrierName(b.carrierCode)} · ${snap?.vesselVisit?.voyage ?? "—"}`
                    : `${snap?.vesselVisit?.vesselName ?? "No vessel yet"}${snap?.vesselVisit?.voyage ? ` · ${snap.vesselVisit.voyage}` : ""}`}
                </span>
              </span>
              <span className="bi-status">{snap ? <StatusBadge status={receivingStatus(snap)} /> : <span className="badge badge-error">No data</span>}</span>
              <span className="bi-cutoff small">
                <span className="muted">Cutoff </span>
                {formatHouston(snap ? cargoCutoff(snap) : null)}
              </span>
              <span className="bi-counts">
                <ContainerCounts p={p} compact />
              </span>
            </summary>
            <div className="booking-detail">
              <div className="bd-top">
                <AccessBadge access={b.access} />
                <span className="small muted">
                  Booked: {(snap?.equipment ?? []).map((e) => `${e.quantity} × ${sizeTypeLabel(e.sizeType)}`).join(", ") || "—"}
                </span>
                <Link href={`/o/${org}/bookings/${b.id}`} className="small">
                  Open booking →
                </Link>
              </div>
              <ContainerTable snap={snap} />
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function ContainerTable({ snap }: { snap: TrackedBooking["latest"] extends infer L ? (L extends { data: infer D } ? D : null) : null }) {
  const containers = snap?.containers ?? [];
  const p = containerProgress(snap);
  const waiting = p.booked - containers.length;
  if (containers.length === 0 && waiting <= 0) return <p className="muted small">The terminal hasn’t reported any containers for this booking yet.</p>;
  return (
    <div className="table-wrap flat">
      <table className="containers">
        <thead>
          <tr>
            <th>Container</th>
            <th>Type</th>
            <th>Status</th>
            <th>Empty picked up</th>
            <th>Delivered full</th>
            <th>Loaded on vessel</th>
          </tr>
        </thead>
        <tbody>
          {containers.map((c) => (
            <tr key={c.number}>
              <td className="mono">{c.number}</td>
              <td>{sizeTypeLabel(c.sizeType)}</td>
              <td>
                <span className={`stage stage-${c.stage.toLowerCase().replace(/_/g, "-")}`}>{CONTAINER_STAGE_LABELS[c.stage]}</span>
              </td>
              <td>{formatHouston(c.emptyPickedUpAt)}</td>
              <td>{formatHouston(c.fullGateInAt)}</td>
              <td>{formatHouston(c.loadedAt)}</td>
            </tr>
          ))}
          {waiting > 0 && (
            <tr>
              <td colSpan={6} className="muted">
                {plural(waiting, "more container")} not picked up yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
