import type { DatabaseSync } from "node:sqlite";

/**
 * Sending email (D-037). Every email is recorded in email_outbox, whether it was sent or only
 * previewed, so super admins can see exactly what Efficio sends.
 *
 * EMAIL_MODE:
 *  - "preview" (default): record only, nothing leaves the server. Used until the domain is set up.
 *  - "postmark": send through Postmark (POSTMARK_SERVER_TOKEN, EMAIL_FROM).
 *  - "off": don't record or send.
 */
export interface OutgoingEmail {
  kind: EmailKind;
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type EmailKind = "invite" | "password_reset" | "exception_alert" | "daily_summary" | "date_change";

export type EmailMode = "preview" | "postmark" | "off";

export interface SendResult {
  status: "preview" | "sent" | "failed" | "off";
  error?: string;
}

export function emailMode(env: NodeJS.ProcessEnv = process.env): EmailMode {
  const m = (env.EMAIL_MODE ?? "preview").trim().toLowerCase();
  return m === "postmark" || m === "off" ? m : "preview";
}

type FetchFn = typeof fetch;

export class Mailer {
  constructor(
    private readonly db: DatabaseSync,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  get mode(): EmailMode {
    return emailMode(this.env);
  }

  /** Never throws: a failed email must not break a refresh or a sign-in. */
  async send(email: OutgoingEmail): Promise<SendResult> {
    const mode = this.mode;
    if (mode === "off") return { status: "off" };
    let status: SendResult["status"] = "preview";
    let error: string | undefined;
    let providerId: string | null = null;

    if (mode === "postmark") {
      try {
        providerId = await this.sendWithPostmark(email);
        status = "sent";
      } catch (e) {
        status = "failed";
        error = e instanceof Error ? e.message : String(e);
        console.error(`[email] ${email.kind} to ${email.to} failed: ${error}`);
      }
    }
    this.db
      .prepare(
        "INSERT INTO email_outbox (kind, to_addr, subject, text_body, html_body, status, error, provider_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(email.kind, email.to, email.subject, email.text, email.html, status, error ?? null, providerId, new Date().toISOString());
    return error ? { status, error } : { status };
  }

  private async sendWithPostmark(email: OutgoingEmail): Promise<string> {
    const token = this.env.POSTMARK_SERVER_TOKEN?.trim();
    const from = this.env.EMAIL_FROM?.trim();
    if (!token || !from) throw new Error("Postmark isn't configured (POSTMARK_SERVER_TOKEN and EMAIL_FROM).");
    const res = await this.fetchFn("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": token },
      body: JSON.stringify({
        From: from,
        To: email.to,
        Subject: email.subject,
        TextBody: email.text,
        HtmlBody: email.html,
        MessageStream: "outbound",
        Tag: email.kind,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { ErrorCode?: number; Message?: string; MessageID?: string };
    if (!res.ok || (body.ErrorCode ?? 0) !== 0) {
      throw new Error(`Postmark ${res.status}${body.ErrorCode ? ` (code ${body.ErrorCode})` : ""}: ${body.Message ?? "unknown error"}`);
    }
    return body.MessageID ?? "";
  }

  recent(limit = 100): OutboxRow[] {
    return this.db.prepare("SELECT * FROM email_outbox ORDER BY id DESC LIMIT ?").all(limit) as unknown as OutboxRow[];
  }

  get(id: number): OutboxRow | null {
    return (this.db.prepare("SELECT * FROM email_outbox WHERE id = ?").get(id) as OutboxRow | undefined) ?? null;
  }
}

export interface OutboxRow {
  id: number;
  kind: EmailKind;
  to_addr: string;
  subject: string;
  text_body: string;
  html_body: string;
  status: "preview" | "sent" | "failed";
  error: string | null;
  provider_id: string | null;
  created_at: string;
}
