import Link from "next/link";
import { EXCEPTION_LABELS, type ExceptionKind } from "@/lib/domain/exceptions";
import { money } from "@/lib/domain/rates";

type Money = { accrued: number; atRisk: number; bookings: number } | null;

/** "$X at risk · $Y already adding up", linking to the rates behind it (S-060). */
function MoneyLine({ org, m }: { org: string; m: Money }) {
  if (!m || (m.accrued === 0 && m.atRisk === 0)) return null;
  return (
    <div className="money-line" aria-label="Money at risk">
      {m.atRisk > 0 && (
        <span className="money-risk">
          <strong>{money(m.atRisk)}</strong> at risk
        </span>
      )}
      {m.accrued > 0 && (
        <span className="money-owed">
          <strong>{money(m.accrued)}</strong> already adding up
        </span>
      )}
      <span className="small muted">
        across {m.bookings} booking{m.bookings === 1 ? "" : "s"} · estimates from <Link href={`/o/${org}/rates`}>your rates</Link>
      </span>
    </div>
  );
}

/** "Needs attention" summary at the top of the bookings page (S-049). */
export function AttentionPanel({ org, summary, active, money: m = null }: { org: string; summary: { kind: ExceptionKind; count: number }[]; active: string; money?: Money }) {
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
      <MoneyLine org={org} m={m} />
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
