import Link from "next/link";
import { ActionForm } from "../ActionForm";
import { forgotPasswordAction } from "../auth-actions";

export const dynamic = "force-dynamic";

export default function ForgotPage() {
  return (
    <section className="auth-card">
      <h1>Forgot your password?</h1>
      <p className="muted">Enter the email you sign in with. We’ll email you a link to choose a new password.</p>
      <ActionForm action={forgotPasswordAction} submitLabel="Email me a reset link" pendingLabel="Sending…" className="stack">
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
      </ActionForm>
      <p className="small">
        <Link href="/login">Back to sign in</Link>
      </p>
    </section>
  );
}
