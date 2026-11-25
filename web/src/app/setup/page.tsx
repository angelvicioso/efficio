import { redirect } from "next/navigation";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/accounts";
import { accountService } from "@/lib/service";
import { ActionForm } from "../ActionForm";
import { setupAction } from "../auth-actions";

export const dynamic = "force-dynamic";

/** First run only: create the first super admin. Disappears once any user exists. */
export default function SetupPage() {
  if (accountService().hasAnyUser()) redirect("/login");
  return (
    <section className="auth-card">
      <h1>Set up Efficio</h1>
      <p className="muted">
        Create the first <strong>super admin</strong> account. Super admins can see and manage every organization. You can
        invite the rest of the team afterwards.
      </p>
      <ActionForm action={setupAction} submitLabel="Create super admin" className="stack">
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
