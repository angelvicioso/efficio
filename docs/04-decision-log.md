# Decision Log

Each decision: what, why, alternatives considered, and what question it resolved.

| ID | Date | Decision | Why | Resolves |
|---|---|---|---|---|
| D-001 | 2026-11-25 | Exporter is the primary (and only logged-in) user for the POC. | Founder direction: exporters own and track bookings. | — |
| D-002 | 2026-11-25 | First feature is read-only visibility of port/terminal data for a booking. | Founder direction; smallest valuable slice. | — |
| D-003 | 2026-11-25 | Port data will be accessed through an adapter layer (one adapter per terminal/aggregator). | Every terminal differs; keeps us from hard-coding one source and lets us start with a mock. | — |
