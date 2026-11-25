# Open Questions

Questions for the team. Each question has an **Owner** (see [Team](00-team.md)): Eduardo (technical), Orlando (domain/operations), Javier (business/finance), or All. Answer inline (or in chat) and we'll move them to **Answered** with a link to any resulting decision.

**Priority:** 🔴 blocks the first story · 🟠 needed soon · 🟢 can wait

## Open

| ID | Pri | Owner | Question | Why it matters | Answer |
|---|---|---|---|---|---|
| Q-001 | 🔴 | Orlando | **Which port(s) and terminal(s) first?** (e.g., LA/Long Beach, Savannah, Houston, NY/NJ, non-US) | Every terminal exposes data differently; we need one concrete target. Note: a *port* usually has several *terminals*, and the data lives at the terminal level. | |
| Q-002 | 🔴 | Javier | **Do you already have API access** (credentials, docs, a contact) with any port/terminal, or a data aggregator? | Most terminals don't offer open public APIs. Determines whether the POC uses live data, an aggregator, or a realistic mock. | |
| Q-003 | 🔴 | Orlando | **What identifier does the exporter have?** Booking number only, or also container numbers / bill of lading? | Terminals often index export data by **booking number** for pre-gate info but by **container number** after gate-in. Affects how we look things up. | |
| Q-004 | 🔴 | Orlando | **What booking information matters most to exporters?** Rank: receiving window (ERD), cargo/doc/VGM cutoffs, booking-on-file at terminal, gate-in, holds, loaded on vessel, vessel ETA/ETD, changes/rolls. | Defines the core screen and which fields we build first. | |
| Q-005 | 🟠 | Javier | **Who is the POC for and what does "success" look like?** (investor demo, a pilot exporter, internal validation) | Sets the bar for real vs. mocked data and polish. | |
| Q-006 | 🟠 | Eduardo | **How "real-time" is real-time?** Every few minutes? Hourly? Push alerts when something changes? | Drives polling design, cost, and whether notifications are in POC. | |
| Q-007 | 🟠 | Orlando | **Do you have a pilot exporter (or your own experience) we can model on?** Typical volume — bookings per week? | Real workflows beat assumptions; volume affects UI (list vs. dashboard). | |
| Q-008 | 🟠 | Orlando | **Should the ocean carrier's data be in the POC too**, or strictly port data? | The carrier owns the booking and vessel schedule; port and carrier data often disagree — showing that gap may be the "aha". | |
| Q-009 | 🟢 | Eduardo | **Platform & tech preferences?** Web app vs. mobile; any preferred stack, cloud, or team skills? | We'll default to a web app with a simple modern stack unless you say otherwise. | |
| Q-010 | 🟢 | Eduardo | **Single exporter or multiple companies (multi-tenant) in the POC?** Multiple users per exporter? | Affects auth and data model early. | |
| Q-011 | 🟢 | All | **Working product name?** "Vicious" is the repo name — is that the brand? | Branding in the UI/docs. | |
| Q-013 | 🟢 | All | **Who has final say on product decisions** (or how do we break ties)? | Fills in the decision log's "who decided" entries. Names and titles are answered (see [Team](00-team.md)). | |
| Q-014 | 🟠 | All | **How much time can each person give per week**, and is anyone else besides Javier part time? | Sets a realistic POC timeline and decides who takes on time-heavy work like outreach. | |
| Q-015 | 🟢 | Javier | **Does Javier's firm or network include industrial/warehouse properties, owners or operators?** | A possible path to the warehouse side of the platform (E-04). Also check for conflicts with his employer. | |

## Answered

| ID | Question | Answer | Decision |
|---|---|---|---|
| Q-012 | What is the third team member's background? | Javier: financial associate/analyst at a commercial real estate firm (full-time job). Strong in finance and business. | D-004 |
