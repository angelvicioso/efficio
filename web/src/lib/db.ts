import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/**
 * SQLite via Node's built-in driver: no native build step, one file on disk.
 * Fine for a single-server POC; swap for Postgres when we have real users.
 */
const SCHEMA_VERSION = 2;

const SCHEMA = `
  CREATE TABLE organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
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
  CREATE TABLE bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    booking_number TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (org_id, booking_number)
  );
  CREATE TABLE snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    fetched_at TEXT NOT NULL,
    source TEXT NOT NULL,
    data TEXT,
    error TEXT
  );
  CREATE INDEX snapshots_booking ON snapshots(booking_id, id);
  CREATE INDEX users_org ON users(org_id);
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
  } else if (version !== SCHEMA_VERSION) {
    throw new Error(`Database ${file} has schema version ${version}; this app expects ${SCHEMA_VERSION}.`);
  }
  return conn;
}

export function getDb(): DatabaseSync {
  db ??= openDb(process.env.EFFICIO_DB_PATH ?? path.join(process.cwd(), ".data", "efficio.db"));
  return db;
}
