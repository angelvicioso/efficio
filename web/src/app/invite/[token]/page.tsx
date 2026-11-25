import Link from "next/link";
import { MIN_PASSWORD_LENGTH, ORG_TYPES } from "@/lib/auth/accounts";
import { accountService } from "@/lib/service";
import { ActionForm } from "../../ActionForm";
import { acceptInviteAction } from "../../auth-actions";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const accounts = accountService();
  const invite = accounts.findInvite(token);
  if (!invite) {
    return (
      <section className="auth-card">
        <h1>Invite not valid</h1>
        <p>This invite link is invalid, has already been used, or has expired. Ask your admin for a new one.</p>
        <p>
          <Link href="/login">Go to sign in</Link>
        </p>
      </section>
    );
  }
  const org = invite.orgId === null ? null : accounts.getOrganization(invite.orgId);
  return (
    <section className="auth-card">
      <h1>Join Efficio</h1>
      <p>
        {invite.isSuperAdmin ? (
          <>
            You’re invited as a <strong>super admin</strong>: you’ll be able to see and manage every organization.
          </>
        ) : (
          <>
            You’re invited to <strong>{org?.name}</strong> ({org ? ORG_TYPES[org.type] : ""}) as{" "}
            {invite.orgRole === "admin" ? "an admin" : "a member"}.
          </>
        )}
      </p>
      <ActionForm action={acceptInviteAction} submitLabel="Create account" className="stack">
        <input type="hidden" name="token" value={token} />
        <label>
          Email
          <input value={invite.email} readOnly disabled />
        </label>
        <label>
          Your name
          <input name="name" autoComplete="name" required />
        </label>
        <label>
          Password <span className="muted small">(at least {MIN_PASSWORD_LENGTH} characters)</span>
          <input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
        </label>
        <label>
          Confirm password
          <input name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
        </label>
      </ActionForm>
    </section>
  );
}
