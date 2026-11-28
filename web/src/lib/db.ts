import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/**
 * SQLite via Node's built-in driver: no native build step, one file on disk.
 * Fine for a single-server POC; swap for Postgres when we have real users.
 */
const SCHEMA_VERSION = 6;

/**
 * Shared bookings (P-001, D-015): one record per real booking (carrier + number).
 * Organizations reach a booking through booking_parties; carrier organizations
 * also see every booking with their carrier code.
 */
const BOOKING_TABLES = `
  CREATE TABLE bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    carrier_code TEXT NOT NULL,
    booking_number TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (carrier_code, booking_number)
  );
  CREATE TABLE booking_parties (
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('claimed', 'verified')),
    added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (booking_id, org_id)
  );
  CREATE INDEX booking_parties_org ON booking_parties(org_id);
  CREATE TABLE snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    fetched_at TEXT NOT NULL,
    source TEXT NOT NULL,
    data TEXT,
    error TEXT
  );
  CREATE INDEX snapshots_booking ON snapshots(booking_id, id);
`;

/**
 * Failed sign-in tracking (R-014, D-021). Keyed by email, including emails with no
 * account, so a lockout never reveals whether an account exists.
 */
const LOGIN_ATTEMPTS_TABLE = `
  CREATE TABLE login_attempts (
    email TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    last_failure_at TEXT
  );
`;

/** Admin-issued password reset links (D-032). Only the token's hash is stored. */
const PASSWORD_RESETS_TABLE = `
  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );
`;

/**
 * Email (D-037): every email Efficio sends or previews, alert de-duplication, daily summaries,
 * and each user's alert preference.
 */
const EMAIL_TABLES = `
  CREATE TABLE email_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    to_addr TEXT NOT NULL,
    subject TEXT NOT NULL,
    text_body TEXT NOT NULL,
    html_body TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('preview', 'sent', 'failed')),
    error TEXT,
    provider_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX email_outbox_created ON email_outbox(created_at);
  CREATE TABLE alerts_sent (
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    alert_key TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    PRIMARY KEY (org_id, booking_id, kind, alert_key)
  );
  CREATE TABLE digests_sent (
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    PRIMARY KEY (org_id, day)
  );
`;

/**
 * Upgrades from older versions. v2 -> v3 keeps organizations, users, sessions and invites,
 * and resets bookings: before v3 they had no carrier and only ever held simulated data.
 */
const MIGRATIONS: Record<number, string> = {
  3: `
    ALTER TABLE organizations ADD COLUMN carrier_code TEXT;
    CREATE UNIQUE INDEX organizations_carrier ON organizations(carrier_code) WHERE carrier_code IS NOT NULL;
    DROP TABLE snapshots;
    DROP TABLE bookings;
    ${BOOKING_TABLES}
  `,
  4: LOGIN_ATTEMPTS_TABLE,
  5: PASSWORD_RESETS_TABLE,
  6: `${EMAIL_TABLES} ALTER TABLE users ADD COLUMN email_alerts INTEGER NOT NULL DEFAULT 1;`,
};

const SCHEMA = `
  CREATE TABLE organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    carrier_code TEXT,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX organizations_carrier ON organizations(carrier_code) WHERE carrier_code IS NOT NULL;
  CREATE TABLE organization_domains (
    domain TEXT PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
  );
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_super_admin INTEGER NOT NULL DEFAULT 0,
    org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    org_role TEXT,
    disabled_at TEXT,
    created_at TEXT NOT NULL,
    email_alerts INTEGER NOT NULL DEFAULT 1,
    CHECK (is_super_admin = 1 OR (org_id IS NOT NULL AND org_role IN ('admin', 'member')))
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE invites (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    org_role TEXT,
    is_super_admin INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );
${BOOKING_TABLES}${LOGIN_ATTEMPTS_TABLE}${PASSWORD_RESETS_TABLE}${EMAIL_TABLES}  CREATE INDEX users_org ON users(org_id);
  CREATE INDEX sessions_user ON sessions(user_id);
`;

let db: DatabaseSync | null = null;

export function openDb(file: string): DatabaseSync {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new DatabaseSync(file);
  conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

  const { user_version: version } = conn.prepare("PRAGMA user_version").get() as { user_version: number };
  if (version === 0) {
    const hasTables = conn.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'bookings'").get();
    if (hasTables) {
      // Pre-login POC database (no organizations). It only ever held simulated data.
      throw new Error(`Database ${file} is from before logins were added. Delete it and restart.`);
    }
    conn.exec(`BEGIN; ${SCHEMA} PRAGMA user_version = ${SCHEMA_VERSION}; COMMIT;`);
  } else if (version < SCHEMA_VERSION) {
    // Safety copy before changing the database's structure (D-022): if an upgrade goes wrong,
    // the previous file is next to it, e.g. efficio.db.before-v4-2026-11-25T05-00-00Z.
    if (file !== ":memory:") {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z");
      conn.exec(`VACUUM INTO '${`${file}.before-v${SCHEMA_VERSION}-${stamp}`.replace(/'/g, "''")}'`);
    }
    for (let v = version + 1; v <= SCHEMA_VERSION; v++) {
      conn.exec("PRAGMA foreign_keys = OFF;");
      conn.exec(`BEGIN; ${MIGRATIONS[v]} PRAGMA user_version = ${v}; COMMIT;`);
      conn.exec("PRAGMA foreign_keys = ON;");
    }
  } else if (version > SCHEMA_VERSION) {
    throw new Error(`Database ${file} has schema version ${version}, newer than this app (${SCHEMA_VERSION}).`);
  }
  return conn;
}

export function getDb(): DatabaseSync {
  db ??= openDb(process.env.EFFICIO_DB_PATH ?? path.join(process.cwd(), ".data", "efficio.db"));
  return db;
}
