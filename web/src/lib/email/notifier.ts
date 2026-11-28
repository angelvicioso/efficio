import type { DatabaseSync } from "node:sqlite";
import type { AccountService, Organization } from "@/lib/auth/accounts";
import type { BookingService, TrackedBooking } from "@/lib/bookings";
import { diffSnapshots } from "@/lib/domain/changes";
import { carrierName } from "@/lib/domain/carriers";
import { bookingExceptions, type ExceptionKind } from "@/lib/domain/exceptions";
import { cargoCutoff } from "@/lib/domain/status";
import { totalExposure } from "@/lib/domain/exposure";
import { RatesService } from "@/lib/ratesService";
import { CUTOFF_LABELS } from "@/lib/domain/types";
import type { Mailer } from "./mailer";
import { dailySummaryEmail, dateChangeEmail, exceptionAlertEmail, type BookingLine } from "./templates";

/**
 * Who gets which email, and when (D-037).
 *  - Date changes: once per terminal update that changes receiving opens or a cutoff.
 *  - Exception alerts: once per critical exception per booking, per cargo cutoff value
 *    (so a changed cutoff can alert again). Checked on every refresh, since exceptions also
 *    start just by time passing (24 hours before cutoff).
 *  - Daily summary: once a day per company, from DIGEST_HOUR Houston time, only if something
 *    needs attention.
 * Each company is emailed separately and never learns who else follows a booking (P-001).
 */
const ALERT_KINDS: ExceptionKind[] = ["EMPTIES_NOT_PICKED_UP", "NOT_DELIVERED", "CUTOFF_PASSED_NOT_DELIVERED", "ROLLED", "ON_HOLD", "VGM_MISSING", "STORAGE"];
// Vessel schedule changes (S-054) go out as date-change emails.
const DATE_FIELDS = new Set<string>(["Receiving opens (ERD)", ...Object.values(CUTOFF_LABELS), "Vessel departs (ETD)"]);
export const DIGEST_HOUR = 7;

/** The Houston day ("2026-12-01") a morning summary is due for, or null before the send hour. */
export function digestDay(now: Date, hour: number = DIGEST_HOUR): string | null {
  const p = houstonParts(now);
  return Number(p.hour) >= hour ? `${p.year}-${p.month}-${p.day}` : null;
}

const houstonParts = (d: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );

export class Notifier {
  constructor(
    private readonly db: DatabaseSync,
    private readonly accounts: AccountService,
    private readonly bookings: BookingService,
    private readonly mailer: Mailer,
    private readonly baseUrl: () => string,
    private readonly now: () => Date = () => new Date(),
    private readonly digestHour: number = DIGEST_HOUR,
  ) {}

  /** Called after every new port reading for a booking. Never throws. */
  async onSnapshot(bookingId: number): Promise<void> {
    if (this.mailer.mode === "off") return;
    try {
      for (const org of this.followers(bookingId)) {
        const recipients = this.accounts.alertRecipients(org.id);
        if (recipients.length === 0) continue;
        const tracked = this.bookings.get(org, bookingId);
        if (!tracked?.latest?.data) continue;
        await this.dateChanges(org, tracked, recipients.map((u) => u.email));
        await this.exceptionAlerts(org, tracked, recipients.map((u) => u.email));
      }
    } catch (e) {
      console.error(`[email] notifications for booking ${bookingId} failed:`, e);
    }
  }

  private async dateChanges(org: Organization, b: TrackedBooking, to: string[]) {
    if (!b.previous?.data || !b.latest?.data) return;
    const changes = diffSnapshots(b.previous.data, b.latest.data).filter((c) => DATE_FIELDS.has(c.field));
    if (changes.length === 0 || !this.markSent(org.id, b.id, "date_change", String(b.latest.id))) return;
    const line = this.line(org, b);
    for (const addr of to) await this.mailer.send(dateChangeEmail({ to: addr, orgName: org.name, booking: line, changes }));
  }

  private async exceptionAlerts(org: Organization, b: TrackedBooking, to: string[]) {
    // Only critical ones alert by email (a hold days ahead is a warning, shown in the app).
    const current = bookingExceptions(b, this.now()).filter((e) => ALERT_KINDS.includes(e.kind) && e.severity === "critical");
    if (current.length === 0) return;
    const key = cargoCutoff(b.latest!.data!) ?? "none";
    // Record each kind first; only email if at least one is new.
    const fresh = current.filter((e) => this.markSent(org.id, b.id, e.kind, key));
    if (fresh.length === 0) return;
    const line = { ...this.line(org, b), exceptions: current };
    for (const addr of to) await this.mailer.send(exceptionAlertEmail({ to: addr, orgName: org.name, booking: line }));
  }

  /** Morning summaries; call on every scheduler run. Returns how many companies were emailed. */
  async sendDailySummaries(): Promise<number> {
    if (this.mailer.mode === "off") return 0;
    const now = this.now();
    const day = digestDay(now, this.digestHour);
    if (!day) return 0;
    let sent = 0;
    for (const org of this.accounts.listOrganizations()) {
      const done = this.db.prepare("INSERT OR IGNORE INTO digests_sent (org_id, day, sent_at) VALUES (?, ?, ?)").run(org.id, day, now.toISOString());
      if (done.changes === 0) continue;
      const recipients = this.accounts.alertRecipients(org.id);
      if (recipients.length === 0) continue;
      const rates = new RatesService(this.db).forOrg(org.id);
      const list = this.bookings.list(org);
      const lines: BookingLine[] = list
        .map((b) => ({ ...this.line(org, b), exceptions: bookingExceptions(b, now, { detentionFreeDays: rates.detentionFreeDays }) }))
        .filter((l) => l.exceptions.length > 0)
        .sort((a, b) => Number(b.exceptions.some((e) => e.severity === "critical")) - Number(a.exceptions.some((e) => e.severity === "critical")));
      if (lines.length === 0) continue;
      const date = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "long", month: "short", day: "numeric" }).format(now);
      for (const u of recipients) {
        await this.mailer.send(dailySummaryEmail({ to: u.email, orgName: org.name, bookings: lines, money: org.type === "ocean_carrier" ? null : totalExposure(list, rates, now), listLink: `${this.baseUrl()}/o/${org.slug}`, date }));
      }
      sent++;
    }
    return sent;
  }

  /** Companies following a booking: its parties, plus its carrier's organization. */
  private followers(bookingId: number): Organization[] {
    const ids = this.db
      .prepare(
        `SELECT org_id AS id FROM booking_parties WHERE booking_id = ?
         UNION SELECT o.id FROM organizations o JOIN bookings b ON b.carrier_code = o.carrier_code WHERE b.id = ?`,
      )
      .all(bookingId, bookingId) as { id: number }[];
    return ids.map((r) => this.accounts.getOrganization(r.id)).filter((o): o is Organization => !!o);
  }

  /** True the first time this (company, booking, kind, key) is recorded. */
  private markSent(orgId: number, bookingId: number, kind: string, key: string): boolean {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO alerts_sent (org_id, booking_id, kind, alert_key, sent_at) VALUES (?, ?, ?, ?, ?)")
        .run(orgId, bookingId, kind, key, this.now().toISOString()).changes > 0
    );
  }

  private line(org: Organization, b: TrackedBooking): Omit<BookingLine, "exceptions"> {
    const snap = b.latest?.data;
    return {
      bookingNumber: b.bookingNumber,
      carrier: carrierName(b.carrierCode),
      vessel: snap?.vesselVisit ? `${snap.vesselVisit.vesselName}${snap.vesselVisit.voyage ? ` / ${snap.vesselVisit.voyage}` : ""}` : null,
      cutoff: snap ? cargoCutoff(snap) : null,
      link: `${this.baseUrl()}/o/${org.slug}/bookings/${b.id}`,
    };
  }
}
