import type { TrackedBooking } from "@/lib/bookings";
import { bookingExceptions } from "./exceptions";
import { money, type Rates } from "./rates";
import type { Container } from "./types";

/**
 * Money at risk for a booking (S-060, D-040). Estimates, each with how it was worked out.
 *  - accrued: charges adding up now (detention past free days; export storage on rolled containers).
 *  - atRisk: what missing this sailing would add, for bookings with a critical exception.
 */
export interface ExposureLine {
  kind: "accrued" | "atRisk";
  label: string;
  amount: number;
  formula: string;
}

export interface Exposure {
  accrued: number;
  atRisk: number;
  lines: ExposureLine[];
}

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const days = (ms: number) => Math.max(0, Math.ceil(ms / DAY));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Detention for a number of days held, using free days and two daily tiers. */
export function detentionFor(daysHeld: number, r: Rates): number {
  const over = Math.max(0, daysHeld - r.detentionFreeDays);
  const tier1 = Math.min(over, 3);
  const tier2 = Math.max(0, over - 3);
  return tier1 * r.detentionDay4to6 + tier2 * r.detentionDay7plus;
}

/** 53' containers have their own export storage rate. */
const is53 = (c: Container) => /^5/.test(c.sizeType) || /53/.test(c.sizeType);

export function bookingExposure(b: TrackedBooking, rates: Rates, now: Date = new Date()): Exposure {
  const lines: ExposureLine[] = [];
  const snap = b.latest?.data;
  if (!snap?.onFile) return { accrued: 0, atRisk: 0, lines };
  const t = now.getTime();
  const containers = snap.containers ?? [];
  const bookedVessel = snap.vesselVisit?.id ?? null;

  // --- Accrued: detention on empties held past free days (empty out until full in) ---
  const detained = containers
    .filter((c) => c.emptyPickedUpAt)
    .map((c) => ({ c, held: days((c.fullGateInAt ? Date.parse(c.fullGateInAt) : t) - Date.parse(c.emptyPickedUpAt!)) }))
    .filter((x) => detentionFor(x.held, rates) > 0);
  if (detained.length) {
    const amount = detained.reduce((sum, x) => sum + detentionFor(x.held, rates), 0);
    const longest = Math.max(...detained.map((x) => x.held));
    lines.push({
      kind: "accrued",
      label: `Carrier detention: ${plural(detained.length, "container")} held past ${rates.detentionFreeDays} free days`,
      amount,
      formula: `${plural(detained.length, "container")}, up to ${longest} days out (free ${rates.detentionFreeDays}, then ${money(rates.detentionDay4to6)}/day for 3 days, ${money(rates.detentionDay7plus)}/day after)`,
    });
  }

  // --- Accrued: chassis on containers out on the street (empty out until full in), past chassis free days ---
  if (rates.chassisPerDay > 0) {
    const onChassis = containers
      .filter((c) => c.emptyPickedUpAt)
      .map((c) => ({ c, days: Math.max(0, days((c.fullGateInAt ? Date.parse(c.fullGateInAt) : t) - Date.parse(c.emptyPickedUpAt!)) - rates.chassisFreeDays) }))
      .filter((x) => x.days > 0);
    if (onChassis.length) {
      const total = onChassis.reduce((s, x) => s + x.days, 0);
      lines.push({
        kind: "accrued",
        label: `Chassis: ${plural(onChassis.length, "container")}, ${plural(total, "chassis day")}`,
        amount: total * rates.chassisPerDay,
        formula: `${plural(total, "day")}${rates.chassisFreeDays ? ` past ${rates.chassisFreeDays} free` : ""} × ${money(rates.chassisPerDay)} (your chassis rate)`,
      });
    }
  }

  // --- Accrued: export storage on rolled containers stored over 7 days (Subrule 093) ---
  const rolledAtTerminal = containers.filter(
    (c) => c.stage === "FULL_AT_TERMINAL" && c.fullGateInAt && c.plannedVessel && bookedVessel && c.plannedVessel.id !== bookedVessel,
  );
  const storageNow = rolledAtTerminal
    .map((c) => ({ c, periods: Math.floor((t - Date.parse(c.fullGateInAt!)) / WEEK) }))
    .filter((x) => x.periods > 0);
  if (storageNow.length) {
    const amount = storageNow.reduce((s, x) => s + x.periods * (is53(x.c) ? rates.exportStorage53 : rates.exportStorage), 0);
    lines.push({
      kind: "accrued",
      label: `Export storage: ${plural(storageNow.length, "rolled container")} stored over 7 days`,
      amount,
      formula: `${storageNow.map((x) => `${x.c.number}: ${x.periods} × 7-day period`).join("; ")} × ${money(rates.exportStorage)} (Tariff 14, Subrule 093)`,
    });
  }

  // --- At risk: what missing this sailing adds, only when a critical exception says it might happen ---
  const critical = bookingExceptions(b, now, { detentionFreeDays: rates.detentionFreeDays }).filter((e) => e.severity === "critical");
  if (critical.length) {
    const nextDays = rates.nextSailingDays;
    const notLoaded = containers.filter((c) => c.stage !== "LOADED_ON_VESSEL");
    const outNotIn = notLoaded.filter((c) => c.stage === "EMPTY_PICKED_UP" && c.emptyPickedUpAt);
    const atTerminal = notLoaded.filter((c) => c.stage === "FULL_AT_TERMINAL");

    if (outNotIn.length) {
      const extra = outNotIn.reduce((s, c) => {
        const heldNow = days(t - Date.parse(c.emptyPickedUpAt!));
        return s + detentionFor(heldNow + nextDays, rates) - detentionFor(heldNow, rates);
      }, 0);
      if (extra > 0) {
        lines.push({ kind: "atRisk", label: `More detention: ${plural(outNotIn.length, "container")} held ${nextDays} more days`, amount: extra, formula: `until the next sailing, ${nextDays} days later, at the detention rates` });
      }
    }
    if (outNotIn.length && rates.chassisPerDay > 0) {
      lines.push({
        kind: "atRisk",
        label: `More chassis days: ${plural(outNotIn.length, "container")} out ${nextDays} more days`,
        amount: outNotIn.length * nextDays * rates.chassisPerDay,
        formula: `${outNotIn.length} × ${nextDays} days × ${money(rates.chassisPerDay)} (your chassis rate)`,
      });
    }
    if (atTerminal.length) {
      const storage = atTerminal.reduce((s, c) => {
        const storedBy = days(t - Date.parse(c.fullGateInAt ?? new Date(t).toISOString())) + nextDays;
        return s + (storedBy > 7 ? (is53(c) ? rates.exportStorage53 : rates.exportStorage) : 0);
      }, 0);
      if (storage > 0) {
        lines.push({ kind: "atRisk", label: `Export storage if rolled: ${plural(atTerminal.length, "container")} at the terminal`, amount: storage, formula: `stored over 7 days and leaving on another vessel: ${money(rates.exportStorage)} each (Tariff 14, Subrule 093)` });
      }
      lines.push({ kind: "atRisk", label: `Rehandling if rolled: ${plural(atTerminal.length, "container")}`, amount: atTerminal.length * rates.rehandle, formula: `${atTerminal.length} × ${money(rates.rehandle)} (Tariff 14, Subrule 090)` });
      const reefers = atTerminal.filter((c) => c.reefer);
      if (reefers.length) {
        lines.push({ kind: "atRisk", label: `Reefer power for ${nextDays} more days`, amount: reefers.length * nextDays * rates.reeferPowerPerDay, formula: `${plural(reefers.length, "reefer")} × ${nextDays} days × ${money(rates.reeferPowerPerDay)} (Tariff 14, Subrule 090)` });
      }
    }
    const held = notLoaded.filter((c) => (c.holds ?? []).some((h) => /custom|exam|cbp|usda/i.test(h)));
    if (held.length) {
      lines.push({ kind: "atRisk", label: `Customs exam move: ${plural(held.length, "container")}`, amount: held.length * rates.examMove, formula: `${held.length} × ${money(rates.examMove)} (Tariff 14, Subrule 090)` });
    }
    const noVgm = atTerminal.filter((c) => c.vgmVerifiedAt === null);
    if (noVgm.length) {
      lines.push({ kind: "atRisk", label: `Weighing at the terminal (no VGM): ${plural(noVgm.length, "container")}`, amount: noVgm.length * rates.weighContainer, formula: `${noVgm.length} × ${money(rates.weighContainer)} (Tariff 14, Subrule 090)` });
    }
    if (rates.missedSailingCost > 0) {
      lines.push({ kind: "atRisk", label: "Your cost of a missed sailing", amount: rates.missedSailingCost, formula: "your own estimate (Rates)" });
    }
  }
  const sum = (k: ExposureLine["kind"]) => Math.round(lines.filter((l) => l.kind === k).reduce((s, l) => s + l.amount, 0) * 100) / 100;
  return { accrued: sum("accrued"), atRisk: sum("atRisk"), lines };
}

export function totalExposure(bookings: TrackedBooking[], rates: Rates, now: Date = new Date()): { accrued: number; atRisk: number; bookings: number } {
  let accrued = 0;
  let atRisk = 0;
  let n = 0;
  for (const b of bookings) {
    const e = bookingExposure(b, rates, now);
    accrued += e.accrued;
    atRisk += e.atRisk;
    if (e.accrued || e.atRisk) n++;
  }
  return { accrued: Math.round(accrued * 100) / 100, atRisk: Math.round(atRisk * 100) / 100, bookings: n };
}
