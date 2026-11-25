# Efficio — Logistics Collaboration Platform (POC)

_Repo name: `vicious`. Product name: **Efficio**._

A platform that brings together the entities involved in moving export cargo — **exporters, ocean carriers, trucking carriers, ports/terminals, and warehouses** — around a shared view of each booking.

**Primary user (POC):** the Exporter.
**First capability:** an exporter enters a booking and sees, in near-real time, what the port/terminal is reporting about it.

## Run the app
See [web/README.md](web/README.md). Short version: `cd web && npm install && npm run dev`, then open http://localhost:3000 and try booking `HOU1002`.

## How this project is run

We run this like an early-stage startup: ideas become **stories**, unknowns become **questions**, risks become **callouts**, and every choice we make is logged as a **decision**. Everything has an ID so it can be referenced in conversation, commits, and PRs.

| Doc | What's in it | ID prefix |
|---|---|---|
| [Team & roles](docs/00-team.md) | Who owns what | — |
| [Product brief](docs/01-product-brief.md) | Vision, users, problem, POC scope | — |
| [Open questions](docs/02-open-questions.md) | Things the founder needs to answer | `Q-###` |
| [Backlog](docs/03-backlog.md) | Epics and user stories, with status | `E-##`, `S-###` |
| [Decision log](docs/04-decision-log.md) | What we decided, why, and when | `D-###` |
| [Callouts & risks](docs/05-callouts-and-risks.md) | Risks, assumptions, things to watch | `R-###`, `A-###` |
| [Glossary](docs/06-glossary.md) | Shipping/logistics terms used in this project | — |
| [Interviews](docs/interviews/) | Interview guides and notes with the team and customers | — |
| [Integrations](docs/integrations/) | Technical notes for each data source (no secrets) | — |

### Status vocabulary
- **Questions:** `Open` → `Answered` (answer recorded + linked decision if any)
- **Stories:** `Draft` → `Ready` (questions resolved, acceptance criteria agreed) → `In progress` → `Done`
- **Risks:** `Open` → `Mitigated` / `Accepted` / `Closed`
