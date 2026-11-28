import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/session";
import { formatHouston } from "@/lib/format";
import { mailService } from "@/lib/service";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  invite: "Invite",
  password_reset: "Password reset",
  exception_alert: "Exception alert",
  daily_summary: "Daily summary",
  date_change: "Date change",
};

/** Super admins: every email Efficio sent or previewed (D-037). */
export default async function EmailsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requireSuperAdmin();
  const mailer = mailService();
  const { id } = await searchParams;
  const open = id ? mailer.get(Number(id)) : null;
  const emails = mailer.recent(200);
  return (
    <>
      <p>
        <Link href="/admin">← All organizations</Link>
      </p>
      <section className="intro">
        <h1>Emails</h1>
        <p className="muted">Everything Efficio sent, or would send, most recent first.</p>
      </section>
      <p className={`callout ${mailer.mode === "postmark" ? "" : "callout-preview"}`}>
        {mailer.mode === "postmark" && "Sending through Postmark."}
        {mailer.mode === "preview" &&
          "Preview mode: emails are recorded here but nothing is sent. Switch to Postmark once the domain is set up (docs/deploy/email.md)."}
        {mailer.mode === "off" && "Email is off: nothing is recorded or sent."}
      </p>

      {open && (
        <section className="card email-preview">
          <div className="muted small">
            {KIND_LABELS[open.kind] ?? open.kind} · to {open.to_addr} · {formatHouston(open.created_at)} · {open.status}
            {open.error && ` · ${open.error}`}
          </div>
          <h2>{open.subject}</h2>
          <pre className="email-text">{open.text_body}</pre>
          <p className="small">
            <Link href="/admin/emails">Close</Link>
          </p>
        </section>
      )}

      {emails.length === 0 ? (
        <p className="empty">No emails yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>To</th>
                <th>Subject</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((e) => (
                <tr key={e.id}>
                  <td className="muted small">{formatHouston(e.created_at)}</td>
                  <td>{KIND_LABELS[e.kind] ?? e.kind}</td>
                  <td>{e.to_addr}</td>
                  <td>
                    <Link href={`/admin/emails?id=${e.id}`}>{e.subject}</Link>
                  </td>
                  <td>
                    <span className={`badge ${e.status === "sent" ? "badge-open" : e.status === "failed" ? "badge-closed" : "badge-not-on-file"}`}>
                      {e.status === "preview" ? "preview" : e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
