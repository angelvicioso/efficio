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
| Q-009 | 🟢 | Eduardo | **Platform & tech preferences?** Web app vs. mobile; any preferred stack, cloud, or team skills? | **Default chosen (D-011):** a Next.js web app in TypeScript with SQLite. Say so if you'd prefer something else. Hosting is still open. | _Default in use_ |
| Q-013 | 🟢 | All | **Who has final say on product decisions** (or how do we break ties)? Default would be the CEO, Orlando. | Fills in the decision log's "who decided" entries. Names and titles are answered (see [Team](00-team.md)). | |
| Q-014 | 🟠 | All | **How much time can each person give per week**, and is anyone else besides Javier part time? | Sets a realistic POC timeline and decides who takes on time-heavy work like outreach. | |
| Q-015 | 🟢 | Javier | **Does Javier's firm or network include industrial/warehouse properties, owners or operators?** | A possible path to the warehouse side of the platform (E-04). Also check for conflicts with his employer. | |
| Q-016 | 🟠 | Eduardo | **How will the team collaborate with an AI business analyst?** Options: (A) Slack channel with Claude, where questions are threads that tag their owner and the repo stays the official record (recommended); (B) GitHub Issues with Claude; (C) a shared web page. Needs: whether everyone is OK with Slack, plus everyone's GitHub and Slack usernames. | Questions go to one person but everyone sees the answers; the agent pushes back on answers and keeps the docs in sync. Also pending: write the analyst rulebook (how the agent presses on answers, what counts as answered, how docs get updated). | _Parked 2026-11-25, to revisit._ |
| Q-017 | 🔴 | Orlando | **Should the exporter also pick the ocean carrier when adding a booking?** | Booking numbers are only unique per carrier, and terminal systems usually look them up together with the carrier's code. One extra dropdown avoids lookups that fail or match the wrong booking. Blocks S-001. | |
| Q-018 | 🔴 | Orlando | **Which cutoffs, exactly?** The **terminal** sets cargo (CY), reefer and hazmat cutoffs. The **carrier** sets documentation/SI and VGM cutoffs. Is it OK for the POC to show the terminal-set ones first, with carrier cutoffs coming later (ties to Q-008)? Also confirm that "booking window" means the **receiving window**, from ERD to cargo cutoff. | Port Houston's API probably won't return carrier-set cutoffs. If exporters care most about doc/VGM cutoffs, port data alone won't cover them. Blocks S-002 and S-003. | |
| Q-019 | 🟠 | Eduardo / Javier | **Who registers for Port Houston's published APIs, if we need them?** Do we need a legal entity? Who reads the terms of use? | **Update 2026-11-25:** less urgent now that Navis N4 access credentials were provided (Q-020). Still needed if those can't be used or don't cover what we need. | |
| Q-021 | 🟠 | Orlando | **Ask the Port Houston/Navis contact who issued Orlando's credentials:** (1) the full EVP API reference (especially the booking and vessel visit endpoints), (2) whether access covers **Barbours Cut** as well as Bayport (scope says `POHA_BPT_PROD`), (3) whether Efficio may **show this data to exporters** who use the platform, and (4) the rate limits. | Unblocks spike S-013 and confirms R-008 (terms of use). One conversation covers everything. | |
| Q-022 | 🟠 | Orlando | **When should a booking count as "closing soon"?** The app uses **48 hours before the cargo cutoff** for now. | Drives the amber warning and, later, alert timing (S-021). | |
| Q-023 | 🟢 | Orlando | **What do real Port Houston booking numbers look like?** (length, letters/digits/dashes, carrier prefixes) The app accepts 4 to 30 letters, digits or dashes. | Catches typos when exporters add a booking. | |
| Q-024 | 🟠 | Eduardo | **Confirm how "per domain" should work.** Built: each organization has one or more email domains; only people with those domains can be invited (super admins can override); super admins see every organization and its domains. **Not built:** people with a matching domain joining on their own without an invite. That needs email verification first (S-008). Is this what you meant? | Decides whether self sign-up by domain is needed for the POC. | |
| Q-025 | 🟢 | Eduardo | **Which email service should Efficio use** for invites and password resets (e.g. Postmark, Resend, Amazon SES), and from which address? | Needed for S-008. Javier may want to weigh in on cost. | |
| Q-026 | 🟢 | Orlando | **Will customers want to sign in with their company Microsoft/Google accounts (SSO)?** | Larger exporters often require it. It changes the login design, so better to know early. | |

## Answered

| ID | Question | Answer | Decision |
|---|---|---|---|
| Q-001 | Which port and terminal first? | **Houston** (Port Houston: Barbours Cut and Bayport container terminals). Answered by Eduardo. | D-006 |
| Q-003 | What identifier does the exporter have? | **Start with booking number only.** Container numbers and B/L come later. Answered by Eduardo. | D-007 |
| Q-004 | What booking information matters most? | **Start with the booking (receiving) window and cutoffs.** Answered by Eduardo. | D-008 |
| Q-011 | Working product name? | **Efficio.** | D-009 |
| Q-020 | Whose credentials are in the "Getting Data" document? | Efficio is our product. The `pha-efficio` client was issued to **Orlando** for Efficio. | D-010 |
| Q-010 | Single exporter or multiple companies (multi-tenant)? | **Multiple companies.** Each customer is an organization with its own data and users; the Efficio team are super admins over all of them. Answered by Eduardo. | D-013 |
| Q-012 | What is the third team member's background? | Javier: financial associate/analyst at a commercial real estate firm (full-time job). Strong in finance and business. | D-004 |
