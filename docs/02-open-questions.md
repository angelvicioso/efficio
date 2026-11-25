# Open Questions

Questions for the founder. Answer inline (or in chat) and we'll move them to **Answered** with a link to any resulting decision.

**Priority:** 🔴 blocks the first story · 🟠 needed soon · 🟢 can wait

## Open

| ID | Pri | Question | Why it matters | Answer |
|---|---|---|---|---|
| Q-001 | 🔴 | **Which port(s) and terminal(s) first?** (e.g., LA/Long Beach, Savannah, Houston, NY/NJ, non-US) | Every terminal exposes data differently; we need one concrete target. Note: a *port* usually has several *terminals*, and the data lives at the terminal level. | |
| Q-002 | 🔴 | **Do you already have API access** (credentials, docs, a contact) with any port/terminal, or a data aggregator? | Most terminals don't offer open public APIs. Determines whether the POC uses live data, an aggregator, or a realistic mock. | |
| Q-003 | 🔴 | **What identifier does the exporter have?** Booking number only, or also container numbers / bill of lading? | Terminals often index export data by **booking number** for pre-gate info but by **container number** after gate-in. Affects how we look things up. | |
| Q-004 | 🔴 | **What booking information matters most to exporters?** Rank: receiving window (ERD), cargo/doc/VGM cutoffs, booking-on-file at terminal, gate-in, holds, loaded on vessel, vessel ETA/ETD, changes/rolls. | Defines the core screen and which fields we build first. | |
| Q-005 | 🟠 | **Who is the POC for and what does "success" look like?** (investor demo, a pilot exporter, internal validation) | Sets the bar for real vs. mocked data and polish. | |
| Q-006 | 🟠 | **How "real-time" is real-time?** Every few minutes? Hourly? Push alerts when something changes? | Drives polling design, cost, and whether notifications are in POC. | |
| Q-007 | 🟠 | **Do you have a pilot exporter (or your own experience) we can model on?** Typical volume — bookings per week? | Real workflows beat assumptions; volume affects UI (list vs. dashboard). | |
| Q-008 | 🟠 | **Should the ocean carrier's data be in the POC too**, or strictly port data? | The carrier owns the booking and vessel schedule; port and carrier data often disagree — showing that gap may be the "aha". | |
| Q-009 | 🟢 | **Platform & tech preferences?** Web app vs. mobile; any preferred stack, cloud, or team skills? | We'll default to a web app with a simple modern stack unless you say otherwise. | |
| Q-010 | 🟢 | **Single exporter or multiple companies (multi-tenant) in the POC?** Multiple users per exporter? | Affects auth and data model early. | |
| Q-011 | 🟢 | **Working product name?** "Vicious" is the repo name — is that the brand? | Branding in the UI/docs. | |

## Answered
_None yet._
