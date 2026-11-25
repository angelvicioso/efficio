# Open Questions

Questions for the team. Each question has an **Owner** (see [Team](00-team.md)): Eduardo (CTO), Orlando (CEO), Javier (CFO & COO), or All. Answer inline (or in chat) and we'll move them to **Answered** with a link to any resulting decision.

**Priority:** 🔴 blocks the first story · 🟠 needed soon · 🟢 can wait

## Open

| ID | Pri | Owner | Question | Why it matters | Answer |
|---|---|---|---|---|---|
| Q-002 | 🔴 | Javier | **Do you already have API access** (credentials, docs, a contact) with any port/terminal, or a data aggregator? | **Update 2026-11-25:** Port Houston publishes official APIs, including *GetBookingInquiry* (checks whether an export booking is on file and returns routing details). Access is by registration form, and credentials arrive by email once approved. Now depends on Q-019 (who registers). | _Partly answered. Path found, access not yet requested._ |
| Q-005 | 🟠 | Javier | **Who is the POC for and what does "success" look like?** (investor demo, a pilot exporter, internal validation) | Sets the bar for real vs. mocked data and polish. | |
| Q-006 | 🟠 | Eduardo | **How "real-time" is real-time?** Every few minutes? Hourly? Push alerts when something changes? | Drives polling design, cost, and whether notifications are in POC. | |
| Q-007 | 🟠 | Orlando | **Do you have a pilot exporter (or your own experience) we can model on?** Typical volume — bookings per week? | Real workflows beat assumptions; volume affects UI (list vs. dashboard). | |
| Q-008 | 🟠 | Orlando | **Should the ocean carrier's data be in the POC too**, or strictly port data? | The carrier owns the booking and vessel schedule; port and carrier data often disagree — showing that gap may be the "aha". | |
| Q-009 | 🟢 | Eduardo | **Platform & tech preferences?** Web app vs. mobile; any preferred stack, cloud, or team skills? | We'll default to a web app with a simple modern stack unless you say otherwise. | |
| Q-010 | 🟢 | Eduardo | **Single exporter or multiple companies (multi-tenant) in the POC?** Multiple users per exporter? | Affects auth and data model early. | |
| Q-011 | 🟢 | All | **Working product name?** "Vicious" is the repo name — is that the brand? | Branding in the UI/docs. | |
| Q-013 | 🟢 | All | **Who has final say on product decisions** (or how do we break ties)? Default would be the CEO, Orlando. | Fills in the decision log's "who decided" entries. Names and titles are answered (see [Team](00-team.md)). | |
| Q-014 | 🟠 | All | **How much time can each person give per week**, and is anyone else besides Javier part time? | Sets a realistic POC timeline and decides who takes on time-heavy work like outreach. | |
| Q-015 | 🟢 | Javier | **Does Javier's firm or network include industrial/warehouse properties, owners or operators?** | A possible path to the warehouse side of the platform (E-04). Also check for conflicts with his employer. | |
| Q-016 | 🟠 | Eduardo | **How will the team collaborate with an AI business analyst?** Options: (A) Slack channel with Claude, where questions are threads that tag their owner and the repo stays the official record (recommended); (B) GitHub Issues with Claude; (C) a shared web page. Needs: whether everyone is OK with Slack, plus everyone's GitHub and Slack usernames. | Questions go to one person but everyone sees the answers; the agent pushes back on answers and keeps the docs in sync. Also pending: write the analyst rulebook (how the agent presses on answers, what counts as answered, how docs get updated). | _Parked 2026-11-25, to revisit._ |
| Q-017 | 🔴 | Orlando | **Should the exporter also pick the ocean carrier when adding a booking?** | Booking numbers are only unique per carrier, and terminal systems usually look them up together with the carrier's code. One extra dropdown avoids lookups that fail or match the wrong booking. Blocks S-001. | |
| Q-018 | 🔴 | Orlando | **Which cutoffs, exactly?** The **terminal** sets cargo (CY), reefer and hazmat cutoffs. The **carrier** sets documentation/SI and VGM cutoffs. Is it OK for the POC to show the terminal-set ones first, with carrier cutoffs coming later (ties to Q-008)? Also confirm that "booking window" means the **receiving window**, from ERD to cargo cutoff. | Port Houston's API probably won't return carrier-set cutoffs. If exporters care most about doc/VGM cutoffs, port data alone won't cover them. Blocks S-002 and S-003. | |
| Q-019 | 🟠 | Eduardo / Javier | **Who registers for Port Houston's published APIs, if we need them?** Do we need a legal entity? Who reads the terms of use? | **Update 2026-11-25:** less urgent now that Navis N4 access credentials were provided (Q-020). Still needed if those can't be used or don't cover what we need. | |
| Q-020 | 🔴 | Eduardo | **Whose credentials are in the "Getting Data" document** (client `pha-efficio`)? Is Efficio one of us, a partner, or another company? Are we allowed to use them for this product, and who is our contact at Port Houston or Navis? | Using another company's credentials could break Port Houston's terms and put the relationship at risk (R-008). We also need a contact for API documentation and support. Blocks S-011 and S-013. | |
| Q-021 | 🟠 | Eduardo | **Do these credentials cover Barbours Cut too, or only Bayport?** The token scope says `POHA_BPT_PROD` (Bayport). | Affects which bookings we can track. We might need a second scope or credential for Barbours Cut. | |

## Answered

| ID | Question | Answer | Decision |
|---|---|---|---|
| Q-001 | Which port and terminal first? | **Houston** (Port Houston: Barbours Cut and Bayport container terminals). Answered by Eduardo. | D-006 |
| Q-003 | What identifier does the exporter have? | **Start with booking number only.** Container numbers and B/L come later. Answered by Eduardo. | D-007 |
| Q-004 | What booking information matters most? | **Start with the booking (receiving) window and cutoffs.** Answered by Eduardo. | D-008 |
| Q-012 | What is the third team member's background? | Javier: financial associate/analyst at a commercial real estate firm (full-time job). Strong in finance and business. | D-004 |
