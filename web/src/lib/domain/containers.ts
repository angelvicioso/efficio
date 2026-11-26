import type { ContainerStage, PortBookingSnapshot } from "./types";

/**
 * Container progress for a booking, or summed over many (S-041).
 * Counts are cumulative: "picked up" includes containers that have since been delivered or loaded.
 */
export interface ContainerProgress {
  booked: number;
  pickedUp: number;
  atTerminal: number;
  loaded: number;
}

const RANK: Record<ContainerStage, number> = { EMPTY_PICKED_UP: 1, FULL_AT_TERMINAL: 2, LOADED_ON_VESSEL: 3 };

export function containerProgress(snapshot: PortBookingSnapshot | null | undefined): ContainerProgress {
  const containers = snapshot?.containers ?? [];
  const bookedQty = (snapshot?.equipment ?? []).reduce((n, e) => n + e.quantity, 0);
  // The terminal's own tallies can be ahead of the container records we could match.
  const tally = snapshot?.tally;
  const pickedUp = Math.max(containers.filter((c) => RANK[c.stage] >= 1).length, tally?.emptiesOut ?? 0);
  const atTerminal = Math.max(containers.filter((c) => RANK[c.stage] >= 2).length, tally?.loadsIn ?? 0);
  return {
    // Never report fewer booked than the terminal has actually handled.
    booked: Math.max(bookedQty, containers.length, pickedUp),
    pickedUp: Math.max(pickedUp, atTerminal),
    atTerminal,
    loaded: containers.filter((c) => RANK[c.stage] >= 3).length,
  };
}

export function addProgress(a: ContainerProgress, b: ContainerProgress): ContainerProgress {
  return { booked: a.booked + b.booked, pickedUp: a.pickedUp + b.pickedUp, atTerminal: a.atTerminal + b.atTerminal, loaded: a.loaded + b.loaded };
}

export const NO_PROGRESS: ContainerProgress = { booked: 0, pickedUp: 0, atTerminal: 0, loaded: 0 };

/** Containers booked but not yet picked up empty. */
export function remainingToPickUp(p: ContainerProgress): number {
  return Math.max(0, p.booked - p.pickedUp);
}

/** Containers still to be delivered to the terminal. */
export function remainingToDeliver(p: ContainerProgress): number {
  return Math.max(0, p.booked - p.atTerminal);
}

// ISO 6346 letter values: A=10, skipping multiples of 11.
const ISO6346: Record<string, number> = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20, K: 21, L: 23, M: 24,
  N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31, U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
};

/** ISO 6346 check digit for the first 10 characters of a container number (e.g. "MSKU123456"). */
export function containerCheckDigit(first10: string): number {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = first10[i].toUpperCase();
    const v = /[0-9]/.test(ch) ? Number(ch) : ISO6346[ch];
    sum += v * 2 ** i;
  }
  return (sum % 11) % 10;
}

export function isValidContainerNumber(number: string): boolean {
  if (!/^[A-Z]{4}\d{7}$/.test(number)) return false;
  return containerCheckDigit(number.slice(0, 10)) === Number(number[10]);
}
