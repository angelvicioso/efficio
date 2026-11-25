import { CUTOFF_LABELS, type PortBookingSnapshot } from "./types";

/** A field that differs between two snapshots, for "what changed" (S-020). */
export interface FieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

function keyFields(s: PortBookingSnapshot): Record<string, string | null> {
  const fields: Record<string, string | null> = {
    "On file at terminal": s.onFile ? "Yes" : "No",
    Terminal: s.terminal,
    Vessel: s.vesselVisit ? `${s.vesselVisit.vesselName}${s.vesselVisit.voyage ? ` / ${s.vesselVisit.voyage}` : ""}` : null,
    "Receiving opens (ERD)": s.receivingOpensAt,
  };
  for (const c of s.cutoffs) fields[CUTOFF_LABELS[c.kind]] = c.at;
  return fields;
}

export function diffSnapshots(before: PortBookingSnapshot, after: PortBookingSnapshot): FieldChange[] {
  const a = keyFields(before);
  const b = keyFields(after);
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changes: FieldChange[] = [];
  for (const field of names) {
    const x = a[field] ?? null;
    const y = b[field] ?? null;
    if (x !== y) changes.push({ field, before: x, after: y });
  }
  return changes;
}
