import { describe, expect, it, vi } from "vitest";
import { openDb } from "../db";
import { AccountService } from "../auth/accounts";
import { BookingService } from "../bookings";
import { MockPortHoustonAdapter } from "../ports/mock";
import { Mailer } from "../email/mailer";
import { Notifier } from "../email/notifier";
import { exceptionAlertEmail, inviteEmail } from "../email/templates";

const PW = "correct-horse-battery";
const env = (o: object) => o as unknown as NodeJS.ProcessEnv;

describe("mailer (D-037)", () => {
  const email = inviteEmail({ to: "ann@acme.com", inviterName: "Eduardo", orgName: "Acme", link: "https://x/invite/abc", days: 7 });

  it("preview mode records the email and sends nothing", async () => {
    const db = openDb(":memory:");
    const fetchFn = vi.fn();
    const m = new Mailer(db, env({}), fetchFn as unknown as typeof fetch);
    expect(await m.send(email)).toEqual({ status: "preview" });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(m.recent()[0]).toMatchObject({ kind: "invite", to_addr: "ann@acme.com", status: "preview", subject: "You're invited to Acme on Efficio" });
  });

  it("sends through Postmark with the right request", async () => {
    const db = openDb(":memory:");
    let req: { url: string; init: RequestInit } | null = null;
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      req = { url, init };
      return new Response(JSON.stringify({ ErrorCode: 0, MessageID: "m-1" }));
    });
    const m = new Mailer(db, env({ EMAIL_MODE: "postmark", POSTMARK_SERVER_TOKEN: "tok", EMAIL_FROM: "Efficio <alerts@efficio.test>" }), fetchFn as unknown as typeof fetch);
    expect(await m.send(email)).toEqual({ status: "sent" });
    expect(req!.url).toBe("https://api.postmarkapp.com/email");
    expect((req!.init.headers as Record<string, string>)["X-Postmark-Server-Token"]).toBe("tok");
    expect(JSON.parse(String(req!.init.body))).toMatchObject({ From: "Efficio <alerts@efficio.test>", To: "ann@acme.com", MessageStream: "outbound", Tag: "invite" });
    expect(m.recent()[0]).toMatchObject({ status: "sent", provider_id: "m-1" });
  });

  it("records failures without throwing (e.g. sender not verified)", async () => {
    const db = openDb(":memory:");
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ ErrorCode: 400, Message: "Sender signature not confirmed" }), { status: 422 }));
    const m = new Mailer(db, env({ EMAIL_MODE: "postmark", POSTMARK_SERVER_TOKEN: "tok", EMAIL_FROM: "a@b.c" }), fetchFn as unknown as typeof fetch);
    const r = await m.send(email);
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/Sender signature not confirmed/);
    expect(m.recent()[0].status).toBe("failed");
    // Not configured at all is also a recorded failure, not a crash
    expect((await new Mailer(db, env({ EMAIL_MODE: "postmark" })).send(email)).error).toMatch(/isn't configured/);
  });

  it("off mode does nothing", async () => {
    const m = new Mailer(openDb(":memory:"), env({ EMAIL_MODE: "off" }));
    expect(await m.send(email)).toEqual({ status: "off" });
    expect(m.recent()).toEqual([]);
  });
});

describe("templates", () => {
  it("escape everything placed in the HTML", () => {
    const e = exceptionAlertEmail({
      to: "a@b.c",
      orgName: "<script>alert(1)</script> Co",
      booking: { bookingNumber: "B1", carrier: "Maersk", vessel: 'SHIP "X"', cutoff: null, link: "https://x/o/a/bookings/1", exceptions: [{ kind: "NOT_DELIVERED", severity: "critical", title: "1 of 2 <b>", detail: "cutoff in 5h" }] },
    });
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).toContain("1 of 2 &lt;b&gt;");
    expect(e.text).toContain("1 of 2 <b> · cutoff in 5h");
  });
});

async function world(now: () => Date = () => new Date()) {
  const db = openDb(":memory:");
  const accounts = new AccountService(db);
  const admin = await accounts.setupFirstSuperAdmin({ email: "admin@efficio.test", name: "Admin", password: PW });
  const acme = accounts.createOrganization({ name: "Acme Exports", type: "exporter", domains: ["acme.com"] });
  const globex = accounts.createOrganization({ name: "Globex Shipping", type: "exporter", domains: ["globex.com"] });
  const join = async (orgId: number, email: string) => {
    const { token } = accounts.createInvite({ email, orgId, orgRole: "admin", createdBy: admin.id });
    return accounts.acceptInvite(token, { name: email.split("@")[0], password: PW });
  };
  const ann = await join(acme.id, "ann@acme.com");
  const bob = await join(acme.id, "bob@acme.com");
  await join(globex.id, "gia@globex.com");
  const adapter = new MockPortHoustonAdapter();
  const bookings = new BookingService(db, adapter);
  const mailer = new Mailer(db, env({}));
  const notifier = new Notifier(db, accounts, bookings, mailer, () => "https://efficio.test", now);
  bookings.onSnapshot = (id) => notifier.onSnapshot(id);
  const sent = () => mailer.recent().reverse().map((e) => `${e.kind} → ${e.to_addr}: ${e.subject}`);
  return { db, accounts, bookings, mailer, notifier, acme, globex, ann, bob, sent };
}

describe("notifications (D-037)", () => {
  it("alerts once when a booking turns critical, to each person with alerts on", async () => {
    const w = await world();
    w.accounts.setEmailAlerts(w.bob.id, false);
    await w.bookings.add(w.acme, { carrierCode: "HLCU", bookingNumber: "HOU1003" }); // cutoff in ~20h, containers outstanding
    expect(w.sent()).toEqual(["exception_alert → ann@acme.com: Action needed: HOU1003: 1 of 3 empties not picked up"]);
    const body = w.mailer.recent()[0].text_body;
    expect(body).toContain("2 of 3 not delivered to the terminal");
    expect(body).toContain("https://efficio.test/o/acme-exports/bookings/");
    // Refreshing again doesn't repeat it
    await w.bookings.refreshAll(w.acme);
    await w.bookings.refreshAll(w.acme);
    expect(w.sent()).toHaveLength(1);
  });

  it("emails date changes once per change, separately to each company", async () => {
    const w = await world();
    await w.bookings.add(w.acme, { carrierCode: "ONEY", bookingNumber: "HOU1005" });
    expect(w.sent()).toEqual([]); // first reading: nothing to compare yet, and not critical
    // Globex starts following the same booking; that fresh reading moves the simulated cutoff 12h earlier.
    // Acme is told; Globex has nothing to compare against yet.
    await w.bookings.add(w.globex, { carrierCode: "ONEY", bookingNumber: "HOU1005" });
    expect(w.sent()).toEqual([
      "date_change → ann@acme.com: HOU1005: Cargo (CY) cutoff changed",
      "date_change → bob@acme.com: HOU1005: Cargo (CY) cutoff changed",
    ]);
    // Next refresh moves it again: now both companies are told, each in its own email.
    await w.bookings.refreshAll(w.globex);
    expect(w.sent().slice(2)).toEqual([
      "date_change → ann@acme.com: HOU1005: Cargo (CY) cutoff changed",
      "date_change → bob@acme.com: HOU1005: Cargo (CY) cutoff changed",
      "date_change → gia@globex.com: HOU1005: Cargo (CY) cutoff changed",
    ]);
    const gia = w.mailer.recent().find((e) => e.to_addr === "gia@globex.com")!;
    expect(gia.text_body).toContain("/o/globex-shipping/");
    expect(gia.text_body).not.toMatch(/Acme/);
    // The simulated cutoff stops moving: another refresh sends nothing new.
    await w.bookings.refreshAll(w.globex);
    expect(w.sent()).toHaveLength(5);
  });

  it("knows when the morning summary is due in Houston time", async () => {
    const { digestDay } = await import("../email/notifier");
    expect(digestDay(new Date("2026-12-01T12:30:00Z"))).toBeNull(); // 6:30 AM CST
    expect(digestDay(new Date("2026-12-01T13:05:00Z"))).toBe("2026-12-01"); // 7:05 AM CST
    expect(digestDay(new Date("2026-07-01T12:05:00Z"))).toBe("2026-07-01"); // 7:05 AM CDT (summer)
    expect(digestDay(new Date("2026-12-02T05:30:00Z"))).toBe("2026-12-01"); // 11:30 PM CST, still Dec 1
  });

  it("sends the daily summary once a day per company, only when something needs attention", async () => {
    const w = await world();
    await w.bookings.add(w.acme, { carrierCode: "HLCU", bookingNumber: "HOU1003" });
    await w.bookings.add(w.globex, { carrierCode: "MSCU", bookingNumber: "HOU1001" }); // nothing wrong: no summary for Globex
    const before = w.mailer.recent().length;
    const tooEarly = new Notifier(w.db, w.accounts, w.bookings, w.mailer, () => "https://efficio.test", () => new Date(), 25);
    expect(await tooEarly.sendDailySummaries()).toBe(0);
    const due = new Notifier(w.db, w.accounts, w.bookings, w.mailer, () => "https://efficio.test", () => new Date(), 0);
    expect(await due.sendDailySummaries()).toBe(1);
    expect(await due.sendDailySummaries()).toBe(0); // already sent today
    const digests = w.mailer.recent().slice(0, w.mailer.recent().length - before);
    expect(digests.every((e) => e.kind === "daily_summary")).toBe(true);
    expect(digests.map((e) => e.to_addr).sort()).toEqual(["ann@acme.com", "bob@acme.com"]);
    expect(digests[0].subject).toMatch(/^1 booking needs attention · /);
    expect(digests[0].text_body).toContain("HOU1003");
  });

  it("does nothing when email is off, so turning it on later starts fresh", async () => {
    const w = await world();
    const off = new Notifier(w.db, w.accounts, w.bookings, new Mailer(w.db, env({ EMAIL_MODE: "off" })), () => "https://x");
    w.bookings.onSnapshot = (id) => off.onSnapshot(id);
    await w.bookings.add(w.acme, { carrierCode: "HLCU", bookingNumber: "HOU1003" });
    expect(w.db.prepare("SELECT COUNT(*) AS n FROM alerts_sent").get()).toEqual({ n: 0 });
  });
});

describe("forgot password (D-037)", () => {
  it("issues a link for active accounts, at most 3 an hour, and nothing for unknown emails", async () => {
    let t = new Date("2026-12-01T12:00:00Z");
    const db = openDb(":memory:");
    const a = new AccountService(db, () => t);
    await a.setupFirstSuperAdmin({ email: "eduardo@efficio.test", name: "E", password: PW });
    expect(a.requestPasswordReset("nobody@efficio.test")).toBeNull();
    const r = a.requestPasswordReset("EDUARDO@efficio.test")!;
    expect(a.findPasswordReset(r.token)?.email).toBe("eduardo@efficio.test");
    expect(a.requestPasswordReset("eduardo@efficio.test")).not.toBeNull();
    expect(a.requestPasswordReset("eduardo@efficio.test")).not.toBeNull();
    expect(a.requestPasswordReset("eduardo@efficio.test")).toBeNull(); // 4th within the hour
    t = new Date("2026-12-01T13:00:01Z");
    expect(a.requestPasswordReset("eduardo@efficio.test")).not.toBeNull();
  });
});
