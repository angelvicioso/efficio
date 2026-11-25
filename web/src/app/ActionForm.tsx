"use client";

import { startTransition, useActionState, useState } from "react";

/** What a form's server action returns: an error, a confirmation, and/or a link to share (invites). */
export interface FormState {
  error?: string | null;
  message?: string | null;
  link?: string | null;
}

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Working…",
  className,
  variant = "primary",
}: {
  action: Action;
  children?: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      // If the page's JavaScript hasn't loaded, the browser submits the form by itself:
      // POST keeps fields (passwords!) out of the address bar and server logs.
      method="post"
      // Submitting through onSubmit (instead of the action prop) stops React from clearing
      // the fields afterwards, so people don't retype everything after an error.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className={className}
    >
      {children}
      <button type="submit" disabled={pending} className={variant === "primary" ? undefined : variant}>
        {pending ? pendingLabel : submitLabel}
      </button>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.message && <p className="form-message">{state.message}</p>}
      {state.link && <CopyLink link={state.link} />}
    </form>
  );
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-link">
      <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
