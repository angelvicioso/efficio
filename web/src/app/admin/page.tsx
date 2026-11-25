import Link from "next/link";
import { ORG_TYPES } from "@/lib/auth/accounts";
import { CARRIERS, carrierName } from "@/lib/domain/carriers";
import { requireSuperAdmin } from "@/lib/auth/session";
import { formatHouston, formatTime } from "@/lib/format";
import { accountService } from "@/lib/service";
import { ActionForm } from "../ActionForm";
import {
  createOrganizationAction,
  inviteSuperAdminAction,
  revokeSuperAdminInviteAction,
  setSuperAdminDisabledAction,
  unlockSuperAdminAction,
  addSampleDataAction,
  removeSampleDataAction,
  checkPortHoustonAction,
} from "./actions";
import { portHoustonConfigured } from "@/lib/ports/navis/check";
import { hasSampleData } from "@/lib/demo/sample";
import { getPortAdapter } from "@/lib/ports";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await requireSuperAdmin();
  const accounts = accountService();
  const orgs = accounts.listOrganizations();
  const superAdmins = accounts.listSuperAdmins();
  const pending = accounts.listPendingInvites(null);

  return (
    <>
      <section className="intro">
        <h1>All organizations</h1>
        <p className="muted">Every customer has its own workspace. Open one to see its bookings and manage its team.</p>
      </section>

      {orgs.length === 0 ? (
        <p className="empty">No organizations yet. Create the first one below.</p>
      ) : (
        <div className="table-wrap section">
          <table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Type</th>
                <th>Email domains</th>
                <th>Users</th>
                <th>Bookings</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/o/${o.slug}`} className="booking-link">
                      {o.name}
                    </Link>
                  </td>
                  <td>
                    {ORG_TYPES[o.type]}
                    {o.carrierCode && <div className="muted small">{carrierName(o.carrierCode)} ({o.carrierCode})</div>}
                  </td>
                  <td>{o.domains.length ? o.domains.join(", ") : <span className="muted">None</span>}</td>
                  <td>
                    <Link href={`/o/${o.slug}/team`}>{o.userCount}</Link>
                  </td>
                  <td>{o.bookingCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="card">
        <h2>Create an organization</h2>
        <ActionForm action={createOrganizationAction} submitLabel="Create organization" className="stack">
          <label>
            Company name
            <input name="name" required placeholder="e.g. Gulf Coast Exports" />
          </label>
          <label>
            Type
            <select name="type" defaultValue="exporter">
              {Object.entries(ORG_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Carrier <span className="muted small">(ocean carriers only)</span>
            <select name="carrierCode" defaultValue="">
              <option value="">Not a carrier</option>
              {Object.entries(CARRIERS).map(([code, name]) => (
                <option key={code} value={code}>
                  {name} ({code})
                </option>
              ))}
            </select>
          </label>
          <p className="muted small">
            A carrier organization automatically sees every booking under its carrier code and can verify the customers on them.
          </p>
          <label>
            Email domains <span className="muted small">(comma-separated, e.g. gulfcoastexports.com)</span>
            <input name="domains" placeholder="company.com" />
          </label>
          <p className="muted small">
            Only people with these email domains can be invited (super admins can override). Free email providers like
            gmail.com aren’t allowed.
          </p>
        </ActionForm>
      </section>

      {getPortAdapter().source === "mock" && (
        <section className="card">
          <h2>Sample data</h2>
          <p className="muted small">
            Adds three sample companies (Acme Exports, Globex Shipping and Maersk Line as a carrier) with simulated bookings and
            containers, so there’s something to explore. It creates <strong>no logins</strong>: open the companies from the list
            above, or invite real people into them. Remove it any time; real companies are never touched.
          </p>
          {hasSampleData(accounts) ? (
            <ActionForm action={removeSampleDataAction} submitLabel="Remove sample data" variant="danger" />
          ) : (
            <ActionForm action={addSampleDataAction} submitLabel="Add sample data" variant="secondary" />
          )}
        </section>
      )}

      <section className="card">
        <h2>Port Houston connection</h2>
        {portHoustonConfigured() ? (
          <>
            <p className="muted small">
              Signs in to Port Houston and calls each data source once. The report shows field names and formats only (for
              example dates as 9999-99-99), never real values, so it’s safe to share. The app keeps showing{" "}
              {getPortAdapter().source === "mock" ? "simulated" : "live"} data either way.
            </p>
            <ActionForm action={checkPortHoustonAction} submitLabel="Test Port Houston connection" pendingLabel="Testing… (up to a minute)" variant="secondary" />
          </>
        ) : (
          <p className="muted small">
            Not configured. Add the <code>PORT_HOUSTON_EVP_*</code> settings in the hosting dashboard (see docs/deploy/render.md) to test the
            connection here.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Super admins</h2>
        <div className="table-wrap flat">
          <table>
            <tbody>
              {superAdmins.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    {u.id === me.id && <span className="muted small"> (you)</span>}
                    <div className="muted small">{u.email}</div>
                  </td>
                  <td>
                    {u.disabled ? <span className="badge badge-closed">Disabled</span> : <span className="badge badge-open">Active</span>}
                    {(() => {
                      const until = accounts.lockedUntil(u.email);
                      return until ? (
                        <div className="lock-line">
                          <span className="badge badge-closing-soon">Locked until {formatTime(until)}</span>
                          <form action={unlockSuperAdminAction} className="inline">
                            <input type="hidden" name="userId" value={u.id} />
                            <button type="submit" className="link-button">
                              Unlock
                            </button>
                          </form>
                        </div>
                      ) : null;
                    })()}
                  </td>
                  <td className="actions-cell">
                    {u.id !== me.id && (
                      <ActionForm action={setSuperAdminDisabledAction} submitLabel={u.disabled ? "Enable" : "Disable"} variant="secondary" className="inline">
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="disabled" value={u.disabled ? "0" : "1"} />
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pending.length > 0 && (
          <>
            <h3>Pending super admin invites</h3>
            <ul className="plain-list">
              {pending.map((i) => (
                <li key={i.id}>
                  {i.email} <span className="muted small">· expires {formatHouston(i.expiresAt)}</span>
                  <form action={revokeSuperAdminInviteAction} className="inline">
                    <input type="hidden" name="inviteId" value={i.id} />
                    <button type="submit" className="link-button">
                      Revoke
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}

        <h3>Invite a super admin</h3>
        <ActionForm action={inviteSuperAdminAction} submitLabel="Create invite link" className="stack">
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <p className="muted small">Super admins can see and change every organization’s data. Only invite Efficio team members.</p>
        </ActionForm>
      </section>
    </>
  );
}
