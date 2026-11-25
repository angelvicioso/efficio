import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/**
 * SQLite via Node's built-in driver: no native build step, one file on disk.
 * Fine for a single-server POC; swap for Postgres when we have real users.
 */
let db: DatabaseSync | null = null;

export function openDb(file: string): DatabaseSync {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new DatabaseSync(file);
  conn.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_number TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      fetched_at TEXT NOT NULL,
      source TEXT NOT NULL,
      data TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS snapshots_booking ON snapshots(booking_id, id);
  `);
  return conn;
}

export function getDb(): DatabaseSync {
  db ??= openDb(process.env.EFFICIO_DB_PATH ?? path.join(process.cwd(), ".data", "efficio.db"));
  return db;
}
