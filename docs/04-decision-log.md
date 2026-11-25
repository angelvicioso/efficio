# Decision Log

Each decision: what, why, alternatives considered, and what question it resolved.

| ID | Date | Decision | Why | Resolves |
|---|---|---|---|---|
| D-001 | 2026-11-25 | Exporter is the primary (and only logged-in) user for the POC. | Founder direction: exporters own and track bookings. | — |
| D-002 | 2026-11-25 | First feature is read-only visibility of port/terminal data for a booking. | Founder direction; smallest valuable slice. | — |
| D-003 | 2026-11-25 | Port data will be accessed through an adapter layer (one adapter per terminal/aggregator). | Every terminal differs; keeps us from hard-coding one source and lets us start with a mock. | — |
| D-004 | 2026-11-25 | Roles: Eduardo is technical lead (CTO), Orlando is domain/operations lead, Javier is business & finance lead. | Matches each person's background. Javier's finance skills cover the business case and data-provider costs, and Orlando's network covers industry access. | Q-012 |
| D-005 | 2026-11-25 | Titles: Orlando is CEO, Javier is CFO & COO, Eduardo is CTO. Replaces the role names in D-004; responsibilities stay the same, and Javier's COO role adds company operations (cadence, tracking, admin). | Eduardo's decision. | — |
