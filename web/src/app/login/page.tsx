import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, homePath } from "@/lib/auth/session";
import { accountService } from "@/lib/service";
import { ActionForm } from "../ActionForm";
import { loginAction } from "../auth-actions";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!accountService().hasAnyUser()) redirect("/setup");
  const user = await getCurrentUser();
  if (user) redirect(homePath(user));
  return (
    <section className="auth-card">
      <h1>Sign in to Efficio</h1>
      <ActionForm action={loginAction} submitLabel="Sign in" pendingLabel="Signing in…" className="stack">
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
      </ActionForm>
      <p className="muted small">
        <Link href="/forgot">Forgot your password?</Link> · Efficio is invite-only: ask your company’s Efficio admin for an
        invite.
      </p>
    </section>
  );
}
