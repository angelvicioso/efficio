/**
 * Fills an EMPTY database with demo organizations, logins and simulated bookings,
 * so someone can click around right away (Codespaces, local demos).
 *
 *   npm run demo:seed
 *
 * Demo only: the passwords are published in the README. It refuses to run if the
 * database already has accounts, or if live Port Houston data is configured.
 */
import { AccountService, type OrgRole } from "../src/lib/auth/accounts";
import { BookingService } from "../src/lib/bookings";
import { getDb } from "../src/lib/db";
import { MockPortHoustonAdapter } from "../src/lib/ports/mock";

export const DEMO_PASSWORD = "efficio-demo-2026";

async function main() {
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

  const join = async (orgId: number, email: string, name: string, orgRole: OrgRole) => {
    const { token } = accounts.createInvite({ email, orgId, orgRole, createdBy: admin.id });
    return accounts.acceptInvite(token, { name, password: DEMO_PASSWORD });
  };

  const acme = accounts.createOrganization({ name: "Acme Exports", type: "exporter", domains: ["acme.demo"] });
  const ann = await join(acme.id, "ann@acme.demo", "Ann (Acme admin)", "admin");
  await join(acme.id, "bob@acme.demo", "Bob (Acme member)", "member");

  const globex = accounts.createOrganization({ name: "Globex Shipping", type: "exporter", domains: ["globex.demo"] });
  const gia = await join(globex.id, "gia@globex.demo", "Gia (Globex admin)", "admin");

  const maersk = accounts.createOrganization({ name: "Maersk Line", type: "ocean_carrier", carrierCode: "MAEU", domains: ["maersk.demo"] });
  await join(maersk.id, "max@maersk.demo", "Max (Maersk admin)", "admin");

  for (const [carrierCode, bookingNumber] of [
    ["MSCU", "HOU1001"],
    ["MAEU", "HOU1002"],
    ["HLCU", "HOU1003"],
    ["ONEY", "HOU1005"],
    ["MAEU", "HOU1006"],
    ["MSCU", "HOU1007"],
  ]) {
    await bookings.add(acme, { carrierCode, bookingNumber }, ann.id);
  }
  for (const [carrierCode, bookingNumber] of [["MAEU", "HOU1002"], ["CMDU", "HOU1004"]]) {
    await bookings.add(globex, { carrierCode, bookingNumber }, gia.id);
  }

  console.log(`Demo data added. Every demo login uses the password: ${DEMO_PASSWORD}
  admin@efficio.demo   super admin (sees every organization)
  ann@acme.demo        Acme Exports admin    (6 bookings; 3 on MAERSK HOUSTON)
  bob@acme.demo        Acme Exports member
  gia@globex.demo      Globex Shipping admin (2 bookings; shares HOU1002 with Acme)
  max@maersk.demo      Maersk Line (carrier) sees every Maersk booking, can verify Acme and Globex`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
