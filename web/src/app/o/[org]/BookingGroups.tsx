import Link from "next/link";
import type { TrackedBooking } from "@/lib/bookings";
import { containerProgress, remainingToDeliver, remainingToPickUp, type ContainerProgress } from "@/lib/domain/containers";
import { carrierName } from "@/lib/domain/carriers";
import { cargoCutoff, receivingStatus, type ReceivingState } from "@/lib/domain/status";
import { CONTAINER_STAGE_LABELS, sizeTypeLabel, type Container } from "@/lib/domain/types";
import type { GroupSummary } from "@/lib/domain/vessels";
import { formatHouston, formatHoustonShort } from "@/lib/format";
import { AccessBadge } from "../../AccessBadge";
import { StatusBadge } from "../../StatusBadge";
import { CarrierTrackingLink } from "../../CarrierTrackingLink";
import { ExceptionList } from "../../ExceptionList";
import { bookingExceptions, worstSeverity } from "@/lib/domain/exceptions";

/** Shared pieces of the Vessels and Carriers views: group header, bookings, containers. */

const STATE_WORDS: [ReceivingState, string][] = [
  ["CLOSING_SOON", "closing soon"],
  ["OPEN", "open"],
  ["NOT_OPEN", "not open yet"],
  ["CLOSED", "closed"],
  ["DATES_PENDING", "dates pending"],
  ["NOT_ON_FILE", "not at terminal yet"],
];

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : word === "empty" ? "empties" : `${word}s`}`;

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
  const toPickUp = remainingToPickUp(p);
  return (
    <div className={compact ? "counts counts-compact" : "counts"}>
      <div className="counts-text">
        <strong>{plural(p.booked, "container")}</strong>
        <span className="muted">
          {" "}
          · {p.pickedUp} picked up{toPickUp > 0 && <strong className="to-pick-up"> ({toPickUp} not yet)</strong>} · {p.atTerminal} at terminal ·{" "}
          {p.loaded} on vessel
        </span>
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
      {!compact && (toPickUp > 0 || left > 0) && (
        <div className="small counts-left">
          {[toPickUp > 0 && `${plural(toPickUp, "empty")} still to pick up`, left > 0 && `${plural(left, "container")} still to deliver to the terminal`]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}
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
  const flagged = g.bookings.map((b) => worstSeverity(bookingExceptions(b))).filter(Boolean);
  const critical = flagged.includes("critical");
  return (
    <div className="group-stats">
      {flagged.length > 0 && (
        <div className={`group-attention attention-${critical ? "critical" : "warning"}`}>
          {critical ? "●" : "▲"} {flagged.length} {flagged.length === 1 ? "booking needs" : "bookings need"} attention
        </div>
      )}
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
        const sev = worstSeverity(bookingExceptions(b));
        return (
          <details key={b.id} className={`booking-item${sev ? ` item-${sev}` : ""}`}>
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
              <ExceptionList items={bookingExceptions(b)} />
              <div className="bd-top">
                <AccessBadge access={b.access} />
                <span className="small muted">
                  Booked: {(snap?.equipment ?? []).map((e) => `${e.quantity} × ${sizeTypeLabel(e.sizeType)}`).join(", ") || "—"}
                </span>
                <Link href={`/o/${org}/bookings/${b.id}`} className="small">
                  Open booking →
                </Link>
                <span className="small">
                  <CarrierTrackingLink carrierCode={b.carrierCode} bookingNumber={b.bookingNumber} />
                </span>
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
            <th>Details</th>
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
              <td>{formatHoustonShort(c.emptyPickedUpAt)}</td>
              <td>{formatHoustonShort(c.fullGateInAt)}</td>
              <td>{formatHoustonShort(c.loadedAt)}</td>
              <td className="chips-cell">
                <ContainerChips c={c} bookedVessel={snap?.vesselVisit?.id ?? null} />
              </td>
            </tr>
          ))}
          {waiting > 0 && (
            <tr>
              <td colSpan={7} className="muted">
                {plural(waiting, "more container")} not picked up yet (empties still to collect)
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Small tags with a container's extra port details (S-051 to S-059). Only shows what the port reports. */
export function ContainerChips({ c, bookedVessel }: { c: Container; bookedVessel: string | null }) {
  const chips: { tone: "bad" | "warn" | "ok" | "info"; text: string; title?: string }[] = [];
  for (const h of c.holds ?? []) chips.push({ tone: "bad", text: `Hold: ${h}` });
  if (c.plannedVessel && bookedVessel && c.plannedVessel.id !== bookedVessel && c.stage !== "LOADED_ON_VESSEL") {
    chips.push({ tone: "bad", text: `Rolled to ${c.plannedVessel.name ?? c.plannedVessel.id}` });
  }
  if (c.stage !== "EMPTY_PICKED_UP" && c.vgmVerifiedAt !== undefined) {
    chips.push(
      c.vgmVerifiedAt
        ? { tone: "ok", text: `VGM ✓${c.vgmKg ? ` ${Math.round(c.vgmKg).toLocaleString("en-US")} kg` : ""}`, title: `Submitted ${formatHouston(c.vgmVerifiedAt)}` }
        : { tone: "bad", text: "No VGM" },
    );
  }
  if (c.lastFreeDay && c.stage === "FULL_AT_TERMINAL") {
    const over = Date.parse(c.lastFreeDay) <= Date.now();
    chips.push({ tone: over ? "bad" : "info", text: `${over ? "Free time ended" : "Free until"} ${formatHoustonShort(c.lastFreeDay)}`, title: c.dwellDays != null ? `${c.dwellDays} days at the terminal` : undefined });
  }
  if (c.reefer) {
    chips.push({
      tone: c.reefer.powered === false && c.stage === "FULL_AT_TERMINAL" ? "warn" : "info",
      text: `Reefer${c.reefer.tempC != null ? ` ${c.reefer.tempC}°C` : ""}${c.reefer.powered == null ? "" : c.reefer.powered ? " · plugged in" : " · not plugged in"}`,
    });
  }
  if (c.hazardous) chips.push({ tone: "warn", text: "Hazmat" });
  if (c.yardPosition && c.stage === "FULL_AT_TERMINAL") chips.push({ tone: "info", text: `Yard ${c.yardPosition}` });
  if (c.appointment) chips.push({ tone: "info", text: `Appt ${formatHoustonShort(c.appointment.at)}`, title: c.appointment.ref ? `Appointment ${c.appointment.ref}` : undefined });
  if (c.trucker) chips.push({ tone: "info", text: c.trucker, title: "Trucking company" });
  if (chips.length === 0) return <span className="muted">—</span>;
  return (
    <span className="chips">
      {chips.map((ch) => (
        <span key={ch.text} className={`chip chip-${ch.tone}`} title={ch.title}>
          {ch.text}
        </span>
      ))}
    </span>
  );
}
