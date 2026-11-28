import Link from "next/link";
import { EXCEPTION_LABELS, type ExceptionKind } from "@/lib/domain/exceptions";

/** "Needs attention" summary at the top of the bookings page (S-049). */
export function AttentionPanel({ org, summary, active }: { org: string; summary: { kind: ExceptionKind; count: number }[]; active: string }) {
  if (summary.length === 0) {
    return (
      <section className="attention-panel attention-clear" aria-label="Needs attention">
        <strong>✓ Nothing needs attention.</strong>{" "}
        <span className="small">No cargo cutoffs within 24 hours with containers outstanding, and no missed cutoffs.</span>
      </section>
    );
  }
  return (
    <section className="attention-panel" aria-label="Needs attention">
      <div className="attention-head">
        <h2>Needs attention</h2>
        {active && (
          <Link href={`/o/${org}`} className="small">
            Show all bookings
          </Link>
        )}
      </div>
      <div className="attention-cards">
        {summary.map(({ kind, count }) => {
          const meta = EXCEPTION_LABELS[kind];
          const on = active === kind;
          return (
            <Link
              key={kind}
              href={on ? `/o/${org}` : `/o/${org}?exception=${kind}&sort=attention&dir=asc`}
              className={`attention-card attention-${meta.severity}${on ? " attention-on" : ""}`}
              aria-current={on ? "true" : undefined}
              title={meta.explain}
            >
              <span className="attention-count">{count}</span>
              <span className="attention-label">
                {meta.label}
                <span className="small">{count === 1 ? "booking" : "bookings"} · {on ? "showing" : "show"}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
