import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../db";

describe("database upgrade v2 -> v3", () => {
  it("keeps accounts and resets bookings", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "efficio-")), "v2.db");
    const v2 = new DatabaseSync(file);
    v2.exec(`
      CREATE TABLE organizations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, type TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE organization_domains (domain TEXT PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE);
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
        is_super_admin INTEGER NOT NULL DEFAULT 0, org_id INTEGER, org_role TEXT, disabled_at TEXT, created_at TEXT NOT NULL);
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE invites (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, org_id INTEGER, org_role TEXT, is_super_admin INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL);
      CREATE TABLE bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        booking_number TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE (org_id, booking_number));
      CREATE TABLE snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        fetched_at TEXT NOT NULL, source TEXT NOT NULL, data TEXT, error TEXT);
      INSERT INTO organizations (name, slug, type, created_at) VALUES ('Acme', 'acme', 'exporter', 'x');
      INSERT INTO users (email, name, password_hash, is_super_admin, created_at) VALUES ('e@x.com', 'E', 'h', 1, 'x');
      INSERT INTO bookings (org_id, booking_number, created_at) VALUES (1, 'HOU1002', 'x');
      INSERT INTO snapshots (booking_id, fetched_at, source) VALUES (1, 'x', 'mock');
      PRAGMA user_version = 2;
    `);
    v2.close();

    const db = openDb(file);
    expect(db.prepare("PRAGMA user_version").get()).toEqual({ user_version: 3 });
    expect(db.prepare("SELECT email FROM users").all()).toEqual([{ email: "e@x.com" }]);
    expect(db.prepare("SELECT slug, carrier_code FROM organizations").all()).toEqual([{ slug: "acme", carrier_code: null }]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM bookings").get()).toEqual({ n: 0 });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
