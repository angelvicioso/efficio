import { redirect } from "next/navigation";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/accounts";
import { accountService } from "@/lib/service";
import { ActionForm } from "../ActionForm";
import { setupAction } from "../auth-actions";
import { setupTokenRequired, setupTokenValid } from "@/lib/auth/setupToken";

export const dynamic = "force-dynamic";

/** First run only: create the first super admin. Disappears once any user exists. */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if (accountService().hasAnyUser()) redirect("/login");
  const { token } = await searchParams;
  if (!setupTokenValid(token)) {
    return (
      <section className="auth-card">
        <h1>Setup link required</h1>
        <p>
          This Efficio server hasn’t been set up yet. To create the first super admin, open the setup link with its token:{" "}
          <code>/setup?token=…</code>. The token is the <code>EFFICIO_SETUP_TOKEN</code> value in the hosting dashboard.
        </p>
      </section>
    );
  }
  return (
    <section className="auth-card">
      <h1>Set up Efficio</h1>
      <p className="muted">
        Create the first <strong>super admin</strong> account. Super admins can see and manage every organization. You can
        invite the rest of the team afterwards.
      </p>
      <ActionForm action={setupAction} submitLabel="Create super admin" className="stack">
        {setupTokenRequired() && <input type="hidden" name="setupToken" value={token ?? ""} />}
        <label>
          Name
          <input name="name" autoComplete="name" required />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password <span className="muted small">(at least {MIN_PASSWORD_LENGTH} characters)</span>
          <input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
        </label>
      </ActionForm>
    </section>
  );
}
