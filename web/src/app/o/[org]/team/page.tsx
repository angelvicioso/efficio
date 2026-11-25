import { canManageOrgSettings } from "@/lib/auth/permissions";
import { requireTeamManager } from "@/lib/auth/session";
import { formatHouston, formatTime } from "@/lib/format";
import { accountService } from "@/lib/service";
import { ActionForm } from "../../../ActionForm";
import {
  addDomainAction,
  inviteMemberAction,
  removeDomainAction,
  revokeInviteAction,
  setDisabledAction,
  setRoleAction,
  unlockMemberAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function TeamPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { user, org } = await requireTeamManager(slug);
  const accounts = accountService();
  const members = accounts.listUsers(org.id);
  const pending = accounts.listPendingInvites(org.id);
  const isSuper = canManageOrgSettings(user);

  return (
    <>
      <section className="intro">
        <h1>Team</h1>
        <p className="muted">People at {org.name} who can see and manage its bookings.</p>
      </section>

      <section className="card">
        <h2>Members ({members.length})</h2>
        {members.length === 0 ? (
          <p className="muted">No one has joined yet. Invite the first admin below.</p>
        ) : (
          <div className="table-wrap flat">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.name}
                      {m.id === user.id && <span className="muted small"> (you)</span>}
                      <div className="muted small">{m.email}</div>
                    </td>
                    <td>
                      <ActionForm action={setRoleAction} submitLabel="Save" variant="secondary" className="inline">
                        <input type="hidden" name="org" value={org.slug} />
                        <input type="hidden" name="userId" value={m.id} />
                        <select name="role" defaultValue={m.orgRole ?? "member"} aria-label={`Role for ${m.name}`}>
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      </ActionForm>
                    </td>
                    <td>
                      {m.disabled ? <span className="badge badge-closed">Disabled</span> : <span className="badge badge-open">Active</span>}
                      {(() => {
                        const until = accounts.lockedUntil(m.email);
                        return until ? (
                          <div className="lock-line">
                            <span className="badge badge-closing-soon">Locked until {formatTime(until)}</span>
                            <form action={unlockMemberAction} className="inline">
                              <input type="hidden" name="org" value={org.slug} />
                              <input type="hidden" name="userId" value={m.id} />
                              <button type="submit" className="link-button">
                                Unlock
                              </button>
                            </form>
                          </div>
                        ) : null;
                      })()}
                    </td>
                    <td className="actions-cell">
                      {m.id !== user.id && (
                        <ActionForm action={setDisabledAction} submitLabel={m.disabled ? "Enable" : "Disable"} variant="secondary" className="inline">
                          <input type="hidden" name="org" value={org.slug} />
                          <input type="hidden" name="userId" value={m.id} />
                          <input type="hidden" name="disabled" value={m.disabled ? "0" : "1"} />
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">Admins can invite people and manage this team. Members can track bookings.</p>
      </section>

      <section className="card">
        <h2>Invite someone</h2>
        {pending.length > 0 && (
          <>
            <h3>Pending invites</h3>
            <ul className="plain-list">
              {pending.map((i) => (
                <li key={i.id}>
                  {i.email} <span className="muted small">· {i.orgRole} · expires {formatHouston(i.expiresAt)}</span>
                  <form action={revokeInviteAction} className="inline">
                    <input type="hidden" name="org" value={org.slug} />
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
        <ActionForm action={inviteMemberAction} submitLabel="Create invite link" className="stack">
          <input type="hidden" name="org" value={org.slug} />
          <label>
            Email
            <input name="email" type="email" required placeholder={org.domains[0] ? `name@${org.domains[0]}` : "name@company.com"} />
          </label>
          <label>
            Role
            <select name="role" defaultValue={members.length === 0 ? "admin" : "member"}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          {isSuper && org.domains.length > 0 && (
            <label className="checkbox">
              <input type="checkbox" name="allowOtherDomain" /> Allow an email outside {org.domains.join(", ")}
            </label>
          )}
          <p className="muted small">Efficio doesn’t send email yet. Copy the link and send it to them yourself.</p>
        </ActionForm>
      </section>

      <section className="card">
        <h2>Email domains</h2>
        {org.domains.length === 0 ? (
          <p className="muted">No domains set. Anyone can be invited.</p>
        ) : (
          <ul className="plain-list">
            {org.domains.map((d) => (
              <li key={d}>
                {d}
                {isSuper && (
                  <form action={removeDomainAction} className="inline">
                    <input type="hidden" name="org" value={org.slug} />
                    <input type="hidden" name="domain" value={d} />
                    <button type="submit" className="link-button">
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {isSuper ? (
          <ActionForm action={addDomainAction} submitLabel="Add domain" variant="secondary" className="inline-form">
            <input type="hidden" name="org" value={org.slug} />
            <input name="domain" placeholder="company.com" aria-label="Domain" required />
          </ActionForm>
        ) : (
          <p className="muted small">Contact Efficio to change your company’s domains.</p>
        )}
      </section>
    </>
  );
}
