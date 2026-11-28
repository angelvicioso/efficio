import { requireUser } from "@/lib/auth/session";
import { mailService } from "@/lib/service";
import { setMyEmailAlertsAction } from "../auth-actions";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();
  const preview = mailService().mode !== "postmark";
  return (
    <>
      <section className="intro">
        <h1>Your account</h1>
        <p className="muted">
          {user.name} · {user.email}
        </p>
      </section>
      <section className="card">
        <h2>Email alerts</h2>
        {user.isSuperAdmin ? (
          <p className="muted">Super admins don’t get booking alerts: alerts go to the people at each company.</p>
        ) : (
          <>
            <p>
              Alerts are <strong>{user.emailAlerts ? "on" : "off"}</strong>. When on, you get an email when:
            </p>
            <ul>
              <li>a booking needs attention within 24 hours of its cargo cutoff (empties not picked up, containers not delivered), or missed its cutoff;</li>
              <li>the terminal changes a booking’s receiving date or cutoffs;</li>
              <li>and a summary each morning (7 AM Houston time) when anything needs attention.</li>
            </ul>
            <form action={setMyEmailAlertsAction}>
              <input type="hidden" name="on" value={user.emailAlerts ? "0" : "1"} />
              <button type="submit" className={user.emailAlerts ? "secondary" : undefined}>
                {user.emailAlerts ? "Turn alerts off" : "Turn alerts on"}
              </button>
            </form>
          </>
        )}
        {preview && <p className="muted small">Note: Efficio isn’t sending email yet (preview mode), so nothing will arrive for now.</p>}
      </section>
    </>
  );
}
