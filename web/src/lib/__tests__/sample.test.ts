import { describe, expect, it } from "vitest";
import { openDb } from "../db";
import { AccountService } from "../auth/accounts";
import { BookingService } from "../bookings";
import { MockPortHoustonAdapter } from "../ports/mock";
import { addSampleData, hasSampleData, removeSampleData } from "../demo/sample";
import { hostedServerReason } from "../../../scripts/seed-demo";

async function setup() {
  const db = openDb(":memory:");
  const accounts = new AccountService(db);
  await accounts.setupFirstSuperAdmin({ email: "eduardo@efficio.test", name: "Eduardo", password: "correct-horse-battery" });
  const bookings = new BookingService(db, new MockPortHoustonAdapter());
  return { db, accounts, bookings };
}

describe("hosted-safe sample data (D-026)", () => {
  it("adds sample companies and bookings without creating any accounts", async () => {
    const { db, accounts, bookings } = await setup();
    const orgs = await addSampleData(accounts, bookings, "mock");
    expect(Object.keys(orgs)).toEqual(["acme-exports", "globex-shipping", "maersk-line"]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 1 }); // only the real super admin
    expect(bookings.list(orgs["acme-exports"])).toHaveLength(6);
    expect(bookings.list(orgs["maersk-line"]).map((b) => b.bookingNumber).sort()).toEqual(["HOU1002", "HOU1006"]);
    expect(hasSampleData(accounts)).toBe(true);
  });

  it("is safe to run twice", async () => {
    const { accounts, bookings } = await setup();
    await addSampleData(accounts, bookings, "mock");
    await addSampleData(accounts, bookings, "mock");
    expect(accounts.listOrganizations()).toHaveLength(3);
  });

  it("refuses with live data, or if a real company has a sample name", async () => {
    const { accounts, bookings } = await setup();
    await expect(addSampleData(accounts, bookings, "navis-evp")).rejects.toThrow(/simulated/);
    accounts.createOrganization({ name: "Acme Exports", type: "exporter", domains: ["acme.com"] });
    await expect(addSampleData(accounts, bookings, "mock")).rejects.toThrow(/real organization/);
  });

  it("removal deletes only sample companies, their users and bookings", async () => {
    const { db, accounts, bookings } = await setup();
    const real = accounts.createOrganization({ name: "Real Exporter", type: "exporter", domains: ["real.com"] });
    await bookings.add(real, { carrierCode: "MAEU", bookingNumber: "HOU1002" }); // shared with sample Acme/Globex
    const orgs = await addSampleData(accounts, bookings, "mock");
    const admin = accounts.listSuperAdmins()[0];
    const { token } = accounts.createInvite({ email: "ann@acme.demo", orgId: orgs["acme-exports"].id, createdBy: admin.id });
    await accounts.acceptInvite(token, { name: "Ann", password: "correct-horse-battery" });

    expect(removeSampleData(db, accounts, bookings)).toBe(3);
    expect(accounts.listOrganizations().map((o) => o.name)).toEqual(["Real Exporter"]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'ann@acme.demo'").get()).toEqual({ n: 0 });
    expect(bookings.list(real).map((b) => b.bookingNumber)).toEqual(["HOU1002"]); // the real company keeps its booking
    expect(db.prepare("SELECT COUNT(*) AS n FROM bookings").get()).toEqual({ n: 1 }); // sample-only bookings are gone
    expect(hasSampleData(accounts)).toBe(false);
  });
});

describe("demo seed guard (D-026)", () => {
  it("refuses on Render or any server with a setup token", () => {
    const env = (o: object) => o as unknown as NodeJS.ProcessEnv;
    expect(hostedServerReason(env({ RENDER: "true" }))).toMatch(/Render/);
    expect(hostedServerReason(env({ EFFICIO_SETUP_TOKEN: "x" }))).toMatch(/setup token/);
    expect(hostedServerReason(env({}))).toBeNull();
  });
});
