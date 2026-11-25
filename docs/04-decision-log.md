# Decision Log

Each decision: what, why, alternatives considered, and what question it resolved.

| ID | Date | Decision | Why | Resolves |
|---|---|---|---|---|
| D-001 | 2026-11-25 | Exporter is the primary (and only logged-in) user for the POC. | Founder direction: exporters own and track bookings. | — |
| D-002 | 2026-11-25 | First feature is read-only visibility of port/terminal data for a booking. | Founder direction; smallest valuable slice. | — |
| D-003 | 2026-11-25 | Port data will be accessed through an adapter layer (one adapter per terminal/aggregator). | Every terminal differs; keeps us from hard-coding one source and lets us start with a mock. | — |
| D-004 | 2026-11-25 | Roles: Eduardo is technical lead (CTO), Orlando is domain/operations lead, Javier is business & finance lead. | Matches each person's background. Javier's finance skills cover the business case and data-provider costs, and Orlando's network covers industry access. | Q-012 |
| D-005 | 2026-11-25 | Titles: Orlando is CEO, Javier is CFO & COO, Eduardo is CTO. Replaces the role names in D-004; responsibilities stay the same, and Javier's COO role adds company operations (cadence, tracking, admin). | Eduardo's decision. | — |
| D-006 | 2026-11-25 | First port is **Port Houston** (Barbours Cut and Bayport terminals). | Eduardo's decision. A good fit: Port Houston runs both terminals itself and publishes official APIs, including a booking inquiry, with self-service registration. One relationship covers two terminals. | Q-001 |
| D-007 | 2026-11-25 | Exporters track by **booking number only** in the POC. | Eduardo's decision. Simplest input. Carrier selection is pending (Q-017), and container numbers are deferred (see R-003). | Q-003 |
| D-008 | 2026-11-25 | The first data shown is the **receiving window (ERD to cargo cutoff) and cutoffs**. | Eduardo's decision. These are the dates that cause missed vessels and extra cost when they change. Which cutoffs exactly is pending (Q-018). | Q-004 |
| D-009 | 2026-11-25 | Product name is **Efficio**. The repo stays `vicious`. | Eduardo confirmed. | Q-011 |
| D-010 | 2026-11-25 | Use the Navis N4 EVP credentials issued to Orlando for Efficio (client `pha-efficio`) as the POC's Port Houston data source. Orlando owns the relationship; Eduardo holds the secret for development. | The credentials are ours. Direct N4 access is more flexible than the published APIs (Q-019 becomes a fallback). | Q-020 |
