import type { PortBookingSnapshot } from "./types";

/**
 * Receiving-window status for the countdown view (S-003).
 * The receiving window runs from ERD (receivingOpensAt) to the cargo cutoff (A-004).
 */
export type ReceivingState =
  | "NOT_ON_FILE"
  | "DATES_PENDING"
  | "NOT_OPEN"
  | "OPEN"
  | "CLOSING_SOON"
  | "CLOSED";

export interface ReceivingStatus {
  state: ReceivingState;
  /** Milliseconds until the next milestone (window opens or cargo cutoff); null if none. */
  msUntilNext: number | null;
  label: string;
}

/** How close to the cargo cutoff counts as "closing soon". Default 48h; to confirm with Orlando. */
export const CLOSING_SOON_MS = 48 * 60 * 60 * 1000;

export function cargoCutoff(snapshot: PortBookingSnapshot): string | null {
  return snapshot.cutoffs.find((c) => c.kind === "cargo")?.at ?? null;
}

export function receivingStatus(
  snapshot: PortBookingSnapshot,
  now: Date = new Date(),
  closingSoonMs: number = CLOSING_SOON_MS,
): ReceivingStatus {
  if (!snapshot.onFile) {
    return { state: "NOT_ON_FILE", msUntilNext: null, label: "Not yet at terminal" };
  }

  const cutoff = cargoCutoff(snapshot);
  const opens = snapshot.receivingOpensAt;
  const t = now.getTime();

  if (!cutoff) {
    if (opens && Date.parse(opens) > t) {
      const ms = Date.parse(opens) - t;
      return { state: "NOT_OPEN", msUntilNext: ms, label: `Opens in ${formatDuration(ms)}` };
    }
    return { state: "DATES_PENDING", msUntilNext: null, label: "On file, dates not published" };
  }

  const cutoffMs = Date.parse(cutoff);
  if (opens && Date.parse(opens) > t) {
    const ms = Date.parse(opens) - t;
    return { state: "NOT_OPEN", msUntilNext: ms, label: `Opens in ${formatDuration(ms)}` };
  }
  if (t >= cutoffMs) {
    return { state: "CLOSED", msUntilNext: null, label: "Receiving closed" };
  }
  const ms = cutoffMs - t;
  if (ms <= closingSoonMs) {
    return { state: "CLOSING_SOON", msUntilNext: ms, label: `Closes in ${formatDuration(ms)}` };
  }
  return { state: "OPEN", msUntilNext: ms, label: `Open, ${formatDuration(ms)} left` };
}

export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}
