import Link from "next/link";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/accounts";
import { accountService } from "@/lib/service";
import { ActionForm } from "../../ActionForm";
import { resetPasswordAction } from "../../auth-actions";

export const dynamic = "force-dynamic";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = accountService().findPasswordReset(token);
  if (!user) {
    return (
      <section className="auth-card">
        <h1>Reset link not valid</h1>
        <p>This password reset link is invalid, has already been used, or has expired (links last 24 hours). Ask your admin for a new one.</p>
        <p>
          <Link href="/login">Go to sign in</Link>
        </p>
      </section>
    );
  }
  return (
    <section className="auth-card">
      <h1>Choose a new password</h1>
      <p className="muted">
        For <strong>{user.email}</strong>. Saving it signs you out everywhere else.
      </p>
      <ActionForm action={resetPasswordAction} submitLabel="Save new password" className="stack">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="username" value={user.email} autoComplete="username" />
        <label>
          New password <span className="muted small">(at least {MIN_PASSWORD_LENGTH} characters)</span>
          <input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
        </label>
        <label>
          Confirm new password
          <input name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
        </label>
      </ActionForm>
    </section>
  );
}
