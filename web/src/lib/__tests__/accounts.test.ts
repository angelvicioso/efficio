import { describe, expect, it } from "vitest";
import { openDb } from "../db";
import { AccountError, AccountService } from "../auth/accounts";
import { canAccessOrg, canManageTeam, canManageOrgSettings } from "../auth/permissions";
import { hashPassword, verifyPassword } from "../auth/crypto";

const PASSWORD = "correct-horse-battery";

async function setup(now = () => new Date("2026-12-01T12:00:00Z")) {
  const a = new AccountService(openDb(":memory:"), now);
  const root = await a.setupFirstSuperAdmin({ email: "Eduardo@Efficio.test", name: "Eduardo", password: PASSWORD });
  const acme = a.createOrganization({ name: "Acme Exports", type: "exporter", domains: ["acme.com"] });
  return { a, root, acme };
}

async function join(a: AccountService, token: string, name = "Person") {
  return a.acceptInvite(token, { name, password: PASSWORD });
}

describe("passwords", () => {
  it("hashes with a salt and verifies", async () => {
    const h1 = await hashPassword("secret-password");
    const h2 = await hashPassword("secret-password");
    expect(h1).not.toBe(h2);
    expect(await verifyPassword("secret-password", h1)).toBe(true);
    expect(await verifyPassword("wrong-password", h1)).toBe(false);
  });
});

describe("first-run setup", () => {
  it("creates one super admin, then refuses", async () => {
    const { a, root } = await setup();
    expect(root.isSuperAdmin).toBe(true);
    expect(root.email).toBe("eduardo@efficio.test");
    await expect(a.setupFirstSuperAdmin({ email: "x@y.com", name: "X", password: PASSWORD })).rejects.toThrow(/already/);
  });

  it("enforces a minimum password length", async () => {
    const a = new AccountService(openDb(":memory:"));
    await expect(a.setupFirstSuperAdmin({ email: "a@b.com", name: "A", password: "short" })).rejects.toThrow(AccountError);
  });
});

describe("organizations and domains", () => {
  it("creates unique slugs", async () => {
    const { a } = await setup();
    expect(a.createOrganization({ name: "Acme Exports", type: "exporter" }).slug).toBe("acme-exports-2");
  });

  it("doesn't create the organization if a domain is rejected", async () => {
    const { a } = await setup();
    expect(() => a.createOrganization({ name: "Bad Co", type: "exporter", domains: ["gmail.com"] })).toThrow(/public email/);
    expect(a.listOrganizations().map((o) => o.name)).toEqual(["Acme Exports"]);
  });

  it("rejects public email domains and domains owned by another org", async () => {
    const { a, acme } = await setup();
    expect(() => a.addDomain(acme.id, "gmail.com")).toThrow(/public email/);
    const other = a.createOrganization({ name: "Other", type: "exporter" });
    expect(() => a.addDomain(other.id, "ACME.com")).toThrow(/another organization/);
    a.addDomain(acme.id, "@acme-intl.com");
    expect(a.getOrganization(acme.id)!.domains).toEqual(["acme-intl.com", "acme.com"]);
  });
});

describe("invites", () => {
  it("only invites emails on the org's domains unless overridden", async () => {
    const { a, root, acme } = await setup();
    expect(() => a.createInvite({ email: "bob@gmail.com", orgId: acme.id, createdBy: root.id })).toThrow(/domains/);
    const { token } = a.createInvite({ email: "bob@gmail.com", orgId: acme.id, createdBy: root.id, allowOtherDomain: true });
    expect(a.findInvite(token)?.email).toBe("bob@gmail.com");
  });

  it("creates a user with the invited role, once", async () => {
    const { a, root, acme } = await setup();
    const { token } = a.createInvite({ email: "ann@acme.com", orgId: acme.id, orgRole: "admin", createdBy: root.id });
    const ann = await join(a, token, "Ann");
    expect(ann).toMatchObject({ orgId: acme.id, orgRole: "admin", isSuperAdmin: false });
    await expect(join(a, token)).rejects.toThrow(/invalid or has expired/);
  });

  it("expires after 7 days", async () => {
    let t = new Date("2026-12-01T12:00:00Z");
    const { a, root, acme } = await setup(() => t);
    const { token } = a.createInvite({ email: "ann@acme.com", orgId: acme.id, createdBy: root.id });
    t = new Date("2026-12-08T12:00:01Z");
    expect(a.findInvite(token)).toBeNull();
  });

  it("invites super admins without an org", async () => {
    const { a, root } = await setup();
    const { token } = a.createInvite({ email: "orlando@efficio.test", isSuperAdmin: true, createdBy: root.id });
    const o = await join(a, token, "Orlando");
    expect(o).toMatchObject({ isSuperAdmin: true, orgId: null });
  });

  it("revokes pending invites only within scope", async () => {
    const { a, root, acme } = await setup();
    const { token, invite } = a.createInvite({ email: "ann@acme.com", orgId: acme.id, createdBy: root.id });
    a.revokeInvite(invite.id, null); // super admin scope: doesn't touch org invites
    expect(a.findInvite(token)).not.toBeNull();
    a.revokeInvite(invite.id, acme.id);
    expect(a.findInvite(token)).toBeNull();
  });
});

describe("login and sessions", () => {
  it("authenticates case-insensitively and rejects wrong passwords and unknown emails", async () => {
    const { a, root } = await setup();
    expect((await a.authenticate("EDUARDO@efficio.test", PASSWORD))?.id).toBe(root.id);
    expect(await a.authenticate("eduardo@efficio.test", "wrong-password")).toBeNull();
    expect(await a.authenticate("nobody@efficio.test", PASSWORD)).toBeNull();
  });

  it("sessions expire, end on logout, and end when a user is disabled", async () => {
    let t = new Date("2026-12-01T12:00:00Z");
    const { a, root, acme } = await setup(() => t);
    const s1 = a.createSession(root.id);
    expect(a.getSessionUser(s1.token)?.id).toBe(root.id);
    a.deleteSession(s1.token);
    expect(a.getSessionUser(s1.token)).toBeNull();

    const { token } = a.createInvite({ email: "ann@acme.com", orgId: acme.id, orgRole: "admin", createdBy: root.id });
    const ann = await join(a, token);
    const { token: bobInvite } = a.createInvite({ email: "bob@acme.com", orgId: acme.id, createdBy: root.id });
    const bob = await join(a, bobInvite);
    const s2 = a.createSession(bob.id);
    a.setDisabled(bob.id, true);
    expect(a.getSessionUser(s2.token)).toBeNull();
    expect(await a.authenticate("bob@acme.com", PASSWORD)).toBeNull();

    const s3 = a.createSession(ann.id);
    t = new Date("2026-12-15T12:00:01Z"); // 14 days later
    expect(a.getSessionUser(s3.token)).toBeNull();
  });
});

describe("safeguards", () => {
  it("keeps at least one active admin per org and one super admin", async () => {
    const { a, root, acme } = await setup();
    const { token } = a.createInvite({ email: "ann@acme.com", orgId: acme.id, orgRole: "admin", createdBy: root.id });
    const ann = await join(a, token);
    expect(() => a.setOrgRole(ann.id, "member")).toThrow(/at least one active admin/);
    expect(() => a.setDisabled(ann.id, true)).toThrow(/at least one active admin/);
    expect(() => a.setDisabled(root.id, true)).toThrow(/last super admin/);
  });
});

describe("permissions", () => {
  it("lets super admins into every org, members only into their own", async () => {
    const { a, root, acme } = await setup();
    const other = a.createOrganization({ name: "Other", type: "exporter" });
    const { token } = a.createInvite({ email: "bob@acme.com", orgId: acme.id, createdBy: root.id });
    const bob = await join(a, token);

    expect(canAccessOrg(root, acme) && canAccessOrg(root, other)).toBe(true);
    expect(canAccessOrg(bob, acme)).toBe(true);
    expect(canAccessOrg(bob, other)).toBe(false);
    expect(canManageTeam(bob, acme)).toBe(false);
    expect(canManageTeam(root, other)).toBe(true);
    expect(canManageOrgSettings(bob)).toBe(false);
  });
});
