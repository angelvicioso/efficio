import type { BookingException } from "@/lib/domain/exceptions";

/** A booking's exceptions: "2 of 6 empties not picked up · cutoff in 18h". */
export function ExceptionList({ items, compact = false }: { items: BookingException[]; compact?: boolean }) {
  if (items.length === 0) return compact ? <span className="muted small">—</span> : null;
  return (
    <ul className={`exceptions${compact ? " exceptions-compact" : ""}`}>
      {items.map((e) => (
        <li key={e.kind} className={`exception exception-${e.severity}`}>
          <span aria-hidden="true" className="exception-icon">
            {e.severity === "critical" ? "●" : "▲"}
          </span>
          <span>
            <strong>{e.title}</strong>
            <span className="exception-detail"> · {e.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
