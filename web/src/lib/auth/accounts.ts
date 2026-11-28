import type { DatabaseSync } from "node:sqlite";
import { isKnownCarrier } from "@/lib/domain/carriers";
import { hashPassword, hashToken, newToken, verifyPassword } from "./crypto";

/** The kinds of companies on the platform. Only exporters use the app in the POC (D-001). */
export const ORG_TYPES = {
  exporter: "Exporter",
  ocean_carrier: "Ocean carrier",
  trucking: "Trucking carrier",
  port: "Port / terminal",
  warehouse: "Warehouse",
  forwarder: "Freight forwarder / NVOCC",
} as const;
export type OrgType = keyof typeof ORG_TYPES;

export type OrgRole = "admin" | "member";

export interface Organization {
  id: number;
  name: string;
  slug: string;
  type: OrgType;
  /** Ocean carrier organizations only: their SCAC code. They see every booking with this code (P-001). */
  carrierCode: string | null;
  domains: string[];
  createdAt: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  orgId: number | null;
  orgRole: OrgRole | null;
  disabled: boolean;
  /** Receives exception alerts, daily summaries and date-change emails (D-037). */
  emailAlerts: boolean;
  createdAt: string;
}

export interface Invite {
  email: string;
  orgId: number | null;
  orgRole: OrgRole | null;
  isSuperAdmin: boolean;
  expiresAt: string;
  createdAt: string;
  /** Short identifier for revoking, derived from the token hash. */
  id: string;
}

export class AccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountError";
  }
}

export const SESSION_DAYS = 14;
export const INVITE_DAYS = 7;
export const MIN_PASSWORD_LENGTH = 10;
/** Password reset links are valid this long (D-032). */
export const RESET_HOURS = 24;
/** Self-service resets allowed per account per hour (D-037). */
export const MAX_SELF_RESETS_PER_HOUR = 3;
/** R-014 / D-021: 5 wrong passwords in a row lock the email for an hour. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 60;

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; lockedUntil: string };

/** Free email providers can't identify a company, so they can't be organization domains. */
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com",
]);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const DAY = 24 * 60 * 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string {
  return normalizeEmail(email).split("@")[1] ?? "";
}

export function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^@/, "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  is_super_admin: number;
  org_id: number | null;
  org_role: OrgRole | null;
  disabled_at: string | null;
  created_at: string;
  email_alerts: number;
}

interface InviteRow {
  token_hash: string;
  email: string;
  org_id: number | null;
  org_role: OrgRole | null;
  is_super_admin: number;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

function toUser(r: UserRow): User {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    isSuperAdmin: r.is_super_admin === 1,
    orgId: r.org_id,
    orgRole: r.org_role,
    disabled: r.disabled_at !== null,
    emailAlerts: r.email_alerts !== 0,
    createdAt: r.created_at,
  };
}

function toInvite(r: InviteRow): Invite {
  return {
    id: r.token_hash.slice(0, 16),
    email: r.email,
    orgId: r.org_id,
    orgRole: r.org_role,
    isSuperAdmin: r.is_super_admin === 1,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  };
}

export class AccountService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private iso(offsetMs = 0): string {
    return new Date(this.now().getTime() + offsetMs).toISOString();
  }

  // ---------- First-run setup ----------

  hasAnyUser(): boolean {
    return this.db.prepare("SELECT 1 FROM users LIMIT 1").get() !== undefined;
  }

  /** Creates the first super admin. Only works while there are no users at all. */
  async setupFirstSuperAdmin(input: { email: string; name: string; password: string }): Promise<User> {
    if (this.hasAnyUser()) throw new AccountError("Setup is already complete.");
    return this.insertUser({ ...input, isSuperAdmin: true, orgId: null, orgRole: null });
  }

  // ---------- Organizations ----------

  createOrganization(input: { name: string; type: OrgType; domains?: string[]; carrierCode?: string | null }): Organization {
    const name = input.name.trim();
    if (name.length < 2) throw new AccountError("Organization name is too short.");
    if (!(input.type in ORG_TYPES)) throw new AccountError("Unknown organization type.");
    const carrierCode = this.checkCarrierCode(input.type, input.carrierCode ?? null, null);
    const base = slugify(name) || "org";
    let slug = base;
    for (let i = 2; this.db.prepare("SELECT 1 FROM organizations WHERE slug = ?").get(slug); i++) slug = `${base}-${i}`;

    // All or nothing: a rejected domain must not leave a half-created organization behind.
    this.db.exec("BEGIN");
    try {
      const result = this.db
        .prepare("INSERT INTO organizations (name, slug, type, carrier_code, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(name, slug, input.type, carrierCode, this.iso());
      const id = Number(result.lastInsertRowid);
      for (const d of input.domains ?? []) if (d.trim()) this.addDomain(id, d);
      this.db.exec("COMMIT");
      return this.getOrganization(id)!;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /** Carrier orgs must be linked to exactly one known carrier code that no other org has. */
  private checkCarrierCode(type: OrgType, input: string | null, orgId: number | null): string | null {
    const code = input?.trim().toUpperCase() || null;
    if (type !== "ocean_carrier") {
      if (code) throw new AccountError("Only ocean carrier organizations have a carrier code.");
      return null;
    }
    if (!code) throw new AccountError("Choose which carrier this organization is.");
    if (!isKnownCarrier(code)) throw new AccountError(`Unknown carrier code ${code}.`);
    const owner = this.db.prepare("SELECT id FROM organizations WHERE carrier_code = ?").get(code) as { id: number } | undefined;
    if (owner && owner.id !== orgId) throw new AccountError(`Another organization is already carrier ${code}.`);
    return code;
  }

  addDomain(orgId: number, input: string): void {
    const domain = normalizeDomain(input);
    if (!DOMAIN.test(domain)) throw new AccountError(`"${input}" isn't a valid domain.`);
    if (PUBLIC_EMAIL_DOMAINS.has(domain)) {
      throw new AccountError(`${domain} is a public email provider and can't identify a company.`);
    }
    const owner = this.db.prepare("SELECT org_id FROM organization_domains WHERE domain = ?").get(domain) as
      | { org_id: number }
      | undefined;
    if (owner && owner.org_id !== orgId) throw new AccountError(`${domain} already belongs to another organization.`);
    if (!owner) this.db.prepare("INSERT INTO organization_domains (domain, org_id) VALUES (?, ?)").run(domain, orgId);
  }

  removeDomain(orgId: number, domain: string): void {
    this.db.prepare("DELETE FROM organization_domains WHERE org_id = ? AND domain = ?").run(orgId, normalizeDomain(domain));
  }

  getOrganization(id: number): Organization | null {
    const r = this.db.prepare("SELECT * FROM organizations WHERE id = ?").get(id) as OrgRow | undefined;
    return r ? this.toOrg(r) : null;
  }

  getOrganizationBySlug(slug: string): Organization | null {
    const r = this.db.prepare("SELECT * FROM organizations WHERE slug = ?").get(slug) as OrgRow | undefined;
    return r ? this.toOrg(r) : null;
  }

  listOrganizations(): (Organization & { userCount: number; bookingCount: number })[] {
    const rows = this.db
      .prepare(
        `SELECT o.*,
          (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id) AS user_count,
          (SELECT COUNT(*) FROM bookings b
            WHERE b.carrier_code = o.carrier_code
               OR EXISTS (SELECT 1 FROM booking_parties p WHERE p.booking_id = b.id AND p.org_id = o.id)) AS booking_count
         FROM organizations o ORDER BY o.name COLLATE NOCASE`,
      )
      .all() as unknown as (OrgRow & { user_count: number; booking_count: number })[];
    return rows.map((r) => ({ ...this.toOrg(r), userCount: r.user_count, bookingCount: r.booking_count }));
  }

  private toOrg(r: OrgRow): Organization {
    const domains = (
      this.db.prepare("SELECT domain FROM organization_domains WHERE org_id = ? ORDER BY domain").all(r.id) as {
        domain: string;
      }[]
    ).map((d) => d.domain);
    return { id: r.id, name: r.name, slug: r.slug, type: r.type, carrierCode: r.carrier_code, domains, createdAt: r.created_at };
  }

  // ---------- Users ----------

  private async insertUser(input: {
    email: string;
    name: string;
    password: string;
    isSuperAdmin: boolean;
    orgId: number | null;
    orgRole: OrgRole | null;
  }): Promise<User> {
    const email = normalizeEmail(input.email);
    const name = input.name.trim();
    if (!EMAIL.test(email)) throw new AccountError("Enter a valid email address.");
    if (!name) throw new AccountError("Enter your name.");
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new AccountError(`Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (this.db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
      throw new AccountError("An account with this email already exists.");
    }
    const result = this.db
      .prepare(
        "INSERT INTO users (email, name, password_hash, is_super_admin, org_id, org_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(email, name, await hashPassword(input.password), input.isSuperAdmin ? 1 : 0, input.orgId, input.orgRole, this.iso());
    return this.getUser(Number(result.lastInsertRowid))!;
  }

  getUser(id: number): User | null {
    const r = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    return r ? toUser(r) : null;
  }

  listUsers(orgId: number): User[] {
    return (this.db.prepare("SELECT * FROM users WHERE org_id = ? ORDER BY name COLLATE NOCASE").all(orgId) as unknown as UserRow[]).map(toUser);
  }

  listSuperAdmins(): User[] {
    return (this.db.prepare("SELECT * FROM users WHERE is_super_admin = 1 ORDER BY name COLLATE NOCASE").all() as unknown as UserRow[]).map(
      toUser,
    );
  }

  setOrgRole(userId: number, role: OrgRole): void {
    const user = this.requireOrgUser(userId);
    if (role === "member" && user.orgRole === "admin") this.assertNotLastAdmin(user);
    this.db.prepare("UPDATE users SET org_role = ? WHERE id = ?").run(role, userId);
  }

  setDisabled(userId: number, disabled: boolean): void {
    const user = this.getUser(userId);
    if (!user) throw new AccountError("User not found.");
    if (disabled && user.isSuperAdmin && this.listSuperAdmins().filter((u) => !u.disabled).length <= 1) {
      throw new AccountError("You can't disable the last super admin.");
    }
    if (disabled && user.orgRole === "admin") this.assertNotLastAdmin(user);
    this.db.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").run(disabled ? this.iso() : null, userId);
    if (disabled) this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  private requireOrgUser(userId: number): User {
    const user = this.getUser(userId);
    if (!user || user.orgId === null) throw new AccountError("User not found in an organization.");
    return user;
  }

  private assertNotLastAdmin(user: User): void {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM users WHERE org_id = ? AND org_role = 'admin' AND disabled_at IS NULL AND id != ?")
      .get(user.orgId, user.id) as { n: number };
    if (row.n === 0) throw new AccountError("Each organization needs at least one active admin.");
  }

  // ---------- Invites ----------

  /**
   * Creates an invite link token. Org invites must match one of the org's email domains
   * unless `allowOtherDomain` is set (super admins only, e.g. for consultants).
   */
  createInvite(input: {
    email: string;
    createdBy: number;
    orgId?: number | null;
    orgRole?: OrgRole;
    isSuperAdmin?: boolean;
    allowOtherDomain?: boolean;
  }): { token: string; invite: Invite } {
    const email = normalizeEmail(input.email);
    if (!EMAIL.test(email)) throw new AccountError("Enter a valid email address.");
    if (this.db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
      throw new AccountError("Someone with this email already has an account.");
    }
    const isSuperAdmin = input.isSuperAdmin === true;
    const orgId = isSuperAdmin ? null : (input.orgId ?? null);
    const orgRole = isSuperAdmin ? null : (input.orgRole ?? "member");
    if (!isSuperAdmin) {
      const org = orgId === null ? null : this.getOrganization(orgId);
      if (!org) throw new AccountError("Organization not found.");
      if (org.domains.length && !org.domains.includes(emailDomain(email)) && !input.allowOtherDomain) {
        throw new AccountError(`${email} isn't on ${org.name}'s domains (${org.domains.join(", ")}).`);
      }
    }
    // Replace any earlier pending invite for the same address.
    this.db.prepare("DELETE FROM invites WHERE email = ? AND used_at IS NULL").run(email);
    const token = newToken();
    this.db
      .prepare(
        "INSERT INTO invites (token_hash, email, org_id, org_role, is_super_admin, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(hashToken(token), email, orgId, orgRole, isSuperAdmin ? 1 : 0, input.createdBy, this.iso(INVITE_DAYS * DAY), this.iso());
    return { token, invite: this.findInvite(token)! };
  }

  /** A usable (unused, unexpired) invite for this token, or null. */
  findInvite(token: string): Invite | null {
    const r = this.db
      .prepare("SELECT * FROM invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
      .get(hashToken(token), this.iso()) as InviteRow | undefined;
    return r ? toInvite(r) : null;
  }

  listPendingInvites(orgId: number | null): Invite[] {
    const sql =
      orgId === null
        ? "SELECT * FROM invites WHERE is_super_admin = 1 AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC"
        : "SELECT * FROM invites WHERE org_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC";
    const rows = (orgId === null ? this.db.prepare(sql).all(this.iso()) : this.db.prepare(sql).all(orgId, this.iso())) as unknown as InviteRow[];
    return rows.map(toInvite);
  }

  revokeInvite(id: string, orgId: number | null): void {
    const scope = orgId === null ? "is_super_admin = 1" : "org_id = ?";
    const params = orgId === null ? [`${id}%`] : [`${id}%`, orgId];
    this.db.prepare(`DELETE FROM invites WHERE token_hash LIKE ? AND used_at IS NULL AND ${scope}`).run(...params);
  }

  async acceptInvite(token: string, input: { name: string; password: string }): Promise<User> {
    const invite = this.findInvite(token);
    if (!invite) throw new AccountError("This invite link is invalid or has expired. Ask for a new one.");
    const user = await this.insertUser({
      email: invite.email,
      name: input.name,
      password: input.password,
      isSuperAdmin: invite.isSuperAdmin,
      orgId: invite.orgId,
      orgRole: invite.orgRole,
    });
    this.db.prepare("UPDATE invites SET used_at = ? WHERE token_hash = ?").run(this.iso(), hashToken(token));
    return user;
  }

  // ---------- Password resets (D-032) ----------

  /**
   * Creates a single-use reset link token for a user. Any earlier unused link for them stops
   * working. Callers must check the admin may manage this user (see app actions).
   */
  createPasswordReset(userId: number, createdBy: number | null): { token: string; expiresAt: string } {
    const user = this.getUser(userId);
    if (!user) throw new AccountError("User not found.");
    // Cancel (not delete) earlier unused links, so they still count toward the hourly limit.
    this.db.prepare("UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(this.iso(), userId);
    const token = newToken();
    const expiresAt = this.iso(RESET_HOURS * 60 * 60 * 1000);
    this.db
      .prepare("INSERT INTO password_resets (token_hash, user_id, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(hashToken(token), userId, createdBy, expiresAt, this.iso());
    return { token, expiresAt };
  }

  /**
   * Self-service "forgot password" (D-037). Returns a token to email, or null when there's no
   * active account or too many recent requests. Callers must reply the same way either way, so
   * the response never reveals whether an account exists.
   */
  requestPasswordReset(emailInput: string): { user: User; token: string } | null {
    const r = this.db.prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(emailInput)) as UserRow | undefined;
    if (!r || r.disabled_at) return null;
    const recent = this.db
      .prepare("SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_by IS NULL AND created_at > ?")
      .get(r.id, this.iso(-60 * 60 * 1000)) as { n: number };
    if (recent.n >= MAX_SELF_RESETS_PER_HOUR) return null;
    const { token } = this.createPasswordReset(r.id, null);
    return { user: toUser(r), token };
  }

  // ---------- Email alerts (D-037) ----------

  setEmailAlerts(userId: number, on: boolean): void {
    this.db.prepare("UPDATE users SET email_alerts = ? WHERE id = ?").run(on ? 1 : 0, userId);
  }

  /** Active people at a company who want alert emails. */
  alertRecipients(orgId: number): User[] {
    return (
      this.db.prepare("SELECT * FROM users WHERE org_id = ? AND disabled_at IS NULL AND email_alerts = 1 ORDER BY id").all(orgId) as unknown as UserRow[]
    ).map(toUser);
  }

  /** The user a usable (unused, unexpired) reset link belongs to, or null. */
  findPasswordReset(token: string): User | null {
    const row = this.db
      .prepare("SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
      .get(hashToken(token), this.iso()) as { user_id: number } | undefined;
    return row ? this.getUser(row.user_id) : null;
  }

  /** Sets the new password, uses up the link, ends every existing sign-in and clears any lockout. */
  async resetPassword(token: string, newPassword: string): Promise<User> {
    const user = this.findPasswordReset(token);
    if (!user) throw new AccountError("This reset link is invalid, already used or expired. Ask an admin for a new one.");
    if (newPassword.length < MIN_PASSWORD_LENGTH) throw new AccountError(`Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`);
    const hash = await hashPassword(newPassword);
    this.db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);
    this.db.prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ?").run(this.iso(), hashToken(token));
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    this.unlock(user.email);
    return this.getUser(user.id)!;
  }

  // ---------- Login & sessions ----------

  /**
   * Sign-in with lockout (R-014, D-021): after MAX_FAILED_LOGINS wrong attempts in a row for an
   * email, it's locked for LOCKOUT_MINUTES, even with the right password. Unknown emails are
   * counted and locked the same way, so responses never reveal whether an account exists.
   */
  async authenticate(emailInput: string, password: string): Promise<LoginResult> {
    const email = normalizeEmail(emailInput);
    const lockedUntil = this.lockedUntil(email);
    if (lockedUntil) return { ok: false, reason: "locked", lockedUntil };

    const r = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
    // Spend the same time whether or not the account exists, so timing doesn't reveal it either.
    const passwordOk = await verifyPassword(password, r?.password_hash ?? DUMMY_HASH);
    if (r && passwordOk && !r.disabled_at) {
      this.db.prepare("DELETE FROM login_attempts WHERE email = ?").run(email);
      return { ok: true, user: toUser(r) };
    }
    return this.recordFailure(email);
  }

  private recordFailure(email: string): LoginResult {
    const row = this.db.prepare("SELECT failures FROM login_attempts WHERE email = ?").get(email) as { failures: number } | undefined;
    const failures = (row?.failures ?? 0) + 1;
    const lockedUntil = failures >= MAX_FAILED_LOGINS ? this.iso(LOCKOUT_MINUTES * 60_000) : null;
    this.db
      .prepare(
        `INSERT INTO login_attempts (email, failures, locked_until, last_failure_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until, last_failure_at = excluded.last_failure_at`,
      )
      .run(email, lockedUntil ? 0 : failures, lockedUntil, this.iso());
    return lockedUntil ? { ok: false, reason: "locked", lockedUntil } : { ok: false, reason: "invalid" };
  }

  /** When this email's lockout ends, or null if it isn't locked. Expired lockouts are cleared. */
  lockedUntil(emailInput: string): string | null {
    const email = normalizeEmail(emailInput);
    const row = this.db.prepare("SELECT locked_until FROM login_attempts WHERE email = ?").get(email) as
      | { locked_until: string | null }
      | undefined;
    if (!row?.locked_until) return null;
    if (row.locked_until > this.iso()) return row.locked_until;
    this.db.prepare("DELETE FROM login_attempts WHERE email = ?").run(email);
    return null;
  }

  /** Lift a lockout early (org admins for their team, super admins for anyone). */
  unlock(emailInput: string): void {
    this.db.prepare("DELETE FROM login_attempts WHERE email = ?").run(normalizeEmail(emailInput));
  }

  createSession(userId: number): { token: string; expiresAt: Date } {
    const token = newToken();
    const expiresAt = new Date(this.now().getTime() + SESSION_DAYS * DAY);
    this.db
      .prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .run(hashToken(token), userId, expiresAt.toISOString(), this.iso());
    return { token, expiresAt };
  }

  getSessionUser(token: string): User | null {
    const r = this.db
      .prepare(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled_at IS NULL`,
      )
      .get(hashToken(token), this.iso()) as UserRow | undefined;
    return r ? toUser(r) : null;
  }

  deleteSession(token: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }
}

interface OrgRow {
  id: number;
  name: string;
  slug: string;
  type: OrgType;
  carrier_code: string | null;
  created_at: string;
}

// A valid scrypt hash of a random password, used only to equalize login timing.
const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
