import type { OutgoingEmail } from "./mailer";
import type { BookingException } from "@/lib/domain/exceptions";
import type { FieldChange } from "@/lib/domain/changes";
import { formatHouston } from "@/lib/format";

/** Email templates (D-037): plain text plus simple HTML. Every value is escaped. */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, bodyHtml: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#16191f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #dde1e7;border-radius:10px">
<tr><td style="padding:20px 24px;border-bottom:1px solid #dde1e7;font-weight:700;font-size:18px">Efficio</td></tr>
<tr><td style="padding:20px 24px;font-size:15px;line-height:1.5"><h1 style="font-size:18px;margin:0 0 12px">${esc(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #dde1e7;font-size:12px;color:#5d6573">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#1f5fbf;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block">${esc(label)}</a></p>`;

const ALERT_FOOTER = "You get this because email alerts are on for your Efficio account. Turn them off under Account in Efficio.";
const ACCOUNT_FOOTER = "Sent by Efficio. If you didn't expect this email, you can ignore it.";

export function inviteEmail(o: { to: string; inviterName: string; orgName: string | null; link: string; days: number }): OutgoingEmail {
  const what = o.orgName ? `join ${o.orgName} on Efficio` : "join Efficio as a super admin";
  const subject = o.orgName ? `You're invited to ${o.orgName} on Efficio` : "You're invited to Efficio";
  const text = `${o.inviterName} invited you to ${what}.\n\nCreate your account: ${o.link}\n\nThe link works once and expires in ${o.days} days.\n\n${ACCOUNT_FOOTER}`;
  const html = layout(
    subject,
    `<p>${esc(o.inviterName)} invited you to ${esc(what)}: booking visibility straight from the terminal at Port Houston.</p>${button(o.link, "Create your account")}<p style="color:#5d6573;font-size:13px">The link works once and expires in ${o.days} days.</p>`,
    ACCOUNT_FOOTER,
  );
  return { kind: "invite", to: o.to, subject, text, html };
}

export function passwordResetEmail(o: { to: string; link: string; hours: number; byAdmin: string | null }): OutgoingEmail {
  const why = o.byAdmin ? `${o.byAdmin} created a password reset link for your Efficio account.` : "Someone (hopefully you) asked to reset your Efficio password.";
  const subject = "Reset your Efficio password";
  const text = `${why}\n\nChoose a new password: ${o.link}\n\nThe link works once and expires in ${o.hours} hours. If you didn't ask for this, ignore this email: your password stays the same.\n`;
  const html = layout(
    subject,
    `<p>${esc(why)}</p>${button(o.link, "Choose a new password")}<p style="color:#5d6573;font-size:13px">The link works once and expires in ${o.hours} hours. If you didn't ask for this, ignore this email: your password stays the same.</p>`,
    ACCOUNT_FOOTER,
  );
  return { kind: "password_reset", to: o.to, subject, text, html };
}

export interface BookingLine {
  bookingNumber: string;
  carrier: string;
  vessel: string | null;
  cutoff: string | null;
  link: string;
  exceptions: BookingException[];
}

const bookingTitle = (b: Pick<BookingLine, "bookingNumber" | "carrier" | "vessel">) =>
  `${b.bookingNumber} (${b.carrier}${b.vessel ? `, ${b.vessel}` : ""})`;

export function exceptionAlertEmail(o: { to: string; orgName: string; booking: BookingLine }): OutgoingEmail {
  const b = o.booking;
  const first = b.exceptions[0];
  const subject = `Action needed: ${b.bookingNumber}: ${first.title}`;
  const lines = b.exceptions.map((e) => `• ${e.title} · ${e.detail}`).join("\n");
  const text = `Booking ${bookingTitle(b)} needs attention:\n\n${lines}\n\nCargo cutoff: ${formatHouston(b.cutoff)} (Houston time)\n\nOpen in Efficio: ${b.link}\n\n${ALERT_FOOTER}`;
  const items = b.exceptions
    .map((e) => `<li style="margin:4px 0;color:${e.severity === "critical" ? "#a12424" : "#8a5300"}"><strong>${esc(e.title)}</strong> · ${esc(e.detail)}</li>`)
    .join("");
  const html = layout(
    `${b.bookingNumber} needs attention`,
    `<p>${esc(o.orgName)} · ${esc(bookingTitle(b))}</p><ul style="padding-left:18px">${items}</ul><p>Cargo cutoff: <strong>${esc(formatHouston(b.cutoff))}</strong> (Houston time)</p>${button(b.link, "Open booking")}`,
    ALERT_FOOTER,
  );
  return { kind: "exception_alert", to: o.to, subject, text, html };
}

export function dailySummaryEmail(o: { to: string; orgName: string; bookings: BookingLine[]; listLink: string; date: string }): OutgoingEmail {
  const n = o.bookings.length;
  const subject = `${n} ${n === 1 ? "booking needs" : "bookings need"} attention · ${o.date}`;
  const text =
    `Good morning. ${n} of ${o.orgName}'s bookings need attention today:\n\n` +
    o.bookings.map((b) => `${bookingTitle(b)}\n${b.exceptions.map((e) => `  • ${e.title} · ${e.detail}`).join("\n")}\n  ${b.link}`).join("\n\n") +
    `\n\nSee them all: ${o.listLink}\n\n${ALERT_FOOTER}`;
  const rows = o.bookings
    .map(
      (b) =>
        `<tr><td style="padding:10px 0;border-top:1px solid #eceef2"><a href="${esc(b.link)}" style="font-weight:700;color:#1f5fbf">${esc(b.bookingNumber)}</a> <span style="color:#5d6573">${esc(b.carrier)}${b.vessel ? ` · ${esc(b.vessel)}` : ""}</span>` +
        b.exceptions.map((e) => `<div style="color:${e.severity === "critical" ? "#a12424" : "#8a5300"};font-size:14px">${esc(e.title)} · ${esc(e.detail)}</div>`).join("") +
        `</td></tr>`,
    )
    .join("");
  const html = layout(
    `${n} ${n === 1 ? "booking needs" : "bookings need"} attention`,
    `<p>${esc(o.orgName)} · ${esc(o.date)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>${button(o.listLink, "See all in Efficio")}`,
    ALERT_FOOTER,
  );
  return { kind: "daily_summary", to: o.to, subject, text, html };
}

export function dateChangeEmail(o: { to: string; orgName: string; booking: Omit<BookingLine, "exceptions">; changes: FieldChange[] }): OutgoingEmail {
  const b = o.booking;
  const fmt = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}T/.test(v) ? formatHouston(v) : (v ?? "not set"));
  const first = o.changes[0];
  const subject = `${b.bookingNumber}: ${first.field} changed`;
  const text = `The terminal changed dates for ${bookingTitle(b)}:\n\n${o.changes.map((c) => `• ${c.field}: ${fmt(c.before)} → ${fmt(c.after)}`).join("\n")}\n\nTimes are Houston time.\n\nOpen in Efficio: ${b.link}\n\n${ALERT_FOOTER}`;
  const items = o.changes.map((c) => `<li style="margin:4px 0"><strong>${esc(c.field)}</strong>: ${esc(fmt(c.before))} → <strong>${esc(fmt(c.after))}</strong></li>`).join("");
  const html = layout(
    `Dates changed for ${b.bookingNumber}`,
    `<p>${esc(o.orgName)} · ${esc(bookingTitle(b))}</p><ul style="padding-left:18px">${items}</ul><p style="color:#5d6573;font-size:13px">Times are Houston time.</p>${button(b.link, "Open booking")}`,
    ALERT_FOOTER,
  );
  return { kind: "date_change", to: o.to, subject, text, html };
}
