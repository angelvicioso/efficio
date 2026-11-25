/**
 * LOCAL / CODESPACES ONLY. Fills an EMPTY database with the sample companies and bookings
 * (src/lib/demo/sample.ts) PLUS demo logins whose password is published in the README.
 *
 *   npm run demo:seed
 *
 * Refuses to run on a hosted server (Render, or any server with a setup token), with live
 * Port Houston data, or if the database already has accounts. For a hosted server, use the
 * "Add sample data" button on the super admin page instead: same data, no demo logins (D-026).
 */
import { AccountService, type OrgRole } from "../src/lib/auth/accounts";
import { BookingService } from "../src/lib/bookings";
import { getDb } from "../src/lib/db";
import { addSampleData } from "../src/lib/demo/sample";
import { MockPortHoustonAdapter } from "../src/lib/ports/mock";

export const DEMO_PASSWORD = "efficio-demo-2026";

export function hostedServerReason(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.RENDER) return "this is a Render server";
  if (env.EFFICIO_SETUP_TOKEN) return "this server is protected with a setup token (a hosted server)";
  return null;
}

async function main() {
  const hosted = hostedServerReason();
  if (hosted) {
    throw new Error(
      `Demo logins have a public password, so they're never created on a hosted server (${hosted}). ` +
        `Sign in as a super admin and use "Add sample data" on the All organizations page instead.`,
    );
  }
  if ((process.env.PORT_ADAPTER ?? "mock").toLowerCase() !== "mock") {
    throw new Error("Demo data is only for simulated data (PORT_ADAPTER=mock).");
  }
  const db = getDb();
  const accounts = new AccountService(db);
  if (accounts.hasAnyUser()) {
    console.log("Database already has accounts; demo data not added.");
    return;
  }
  const bookings = new BookingService(db, new MockPortHoustonAdapter());
  const admin = await accounts.setupFirstSuperAdmin({ email: "admin@efficio.demo", name: "Efficio Admin", password: DEMO_PASSWORD });
  const orgs = await addSampleData(accounts, bookings, "mock");

  const join = async (orgId: number, email: string, name: string, orgRole: OrgRole) => {
    const { token } = accounts.createInvite({ email, orgId, orgRole, createdBy: admin.id });
    return accounts.acceptInvite(token, { name, password: DEMO_PASSWORD });
  };
  await join(orgs["acme-exports"].id, "ann@acme.demo", "Ann (Acme admin)", "admin");
  await join(orgs["acme-exports"].id, "bob@acme.demo", "Bob (Acme member)", "member");
  await join(orgs["globex-shipping"].id, "gia@globex.demo", "Gia (Globex admin)", "admin");
  await join(orgs["maersk-line"].id, "max@maersk.demo", "Max (Maersk admin)", "admin");

  console.log(`Demo data added. Every demo login uses the password: ${DEMO_PASSWORD}
  admin@efficio.demo   super admin (sees every organization)
  ann@acme.demo        Acme Exports admin    (6 bookings; 3 on MAERSK HOUSTON)
  bob@acme.demo        Acme Exports member
  gia@globex.demo      Globex Shipping admin (2 bookings; shares HOU1002 with Acme)
  max@maersk.demo      Maersk Line (carrier) sees every Maersk booking, can verify Acme and Globex`);
}

if (process.argv[1]?.endsWith("seed-demo.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
