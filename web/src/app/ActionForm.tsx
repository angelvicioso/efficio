"use client";

import { startTransition, useActionState, useState } from "react";

/** What a form's server action returns: an error, a confirmation, and/or a link to share (invites). */
export interface FormState {
  error?: string | null;
  message?: string | null;
  link?: string | null;
  /** Preformatted text to show below the form, e.g. a diagnostic report. */
  details?: string | null;
  /** Grouped results, e.g. what happened to each booking number in a batch. */
  groups?: ResultGroup[] | null;
}

export interface ResultGroup {
  tone: "ok" | "info" | "warn" | "error";
  title: string;
  items: { label: string; href?: string }[];
  /** Text to offer with a Copy button, e.g. the numbers to paste again. */
  copy?: string;
  hint?: string;
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
      {state.details && <DetailsOutput text={state.details} />}
      {state.groups && state.groups.length > 0 && <ResultGroups groups={state.groups} />}
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

function DetailsOutput({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <pre className="details-output">{text}</pre>
      <button
        type="button"
        className="secondary small-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy report"}
      </button>
    </div>
  );
}

function ResultGroups({ groups }: { groups: ResultGroup[] }) {
  return (
    <div className="result-groups" role="status">
      {groups.map((g) => (
        <div key={g.title} className={`result-group result-${g.tone}`}>
          <div className="result-title">{g.title}</div>
          <div className="result-items">
            {g.items.map((it, i) => (
              <span key={it.label}>
                {i > 0 && ", "}
                {it.href ? <a href={it.href}>{it.label}</a> : it.label}
              </span>
            ))}
          </div>
          {g.hint && <div className="small result-hint">{g.hint}</div>}
          {g.copy && <CopyText text={g.copy} />}
        </div>
      ))}
    </div>
  );
}

function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="link-button small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : "Copy these numbers"}
    </button>
  );
}
