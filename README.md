# Efficio — Logistics Collaboration Platform (POC)

_Repository: `angelvicioso/efficio` (renamed from `vicious`)._

A platform that brings together the entities involved in moving export cargo — **exporters, ocean carriers, trucking carriers, ports/terminals, and warehouses** — around a shared view of each booking.

**Primary user (POC):** the Exporter.
**First capability:** an exporter enters a booking and sees, in near-real time, what the port/terminal is reporting about it.

## Try it now
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/angelvicioso/efficio/tree/claude/logistics-platform-poc-x95492?quickstart=1)

Click the button (you need a GitHub account with access to this repo). GitHub builds a private cloud copy of the app, fills it with **simulated** data and opens it in your browser: first start takes about 2–3 minutes. Then sign in with a demo login:

| Login | Who | What you'll see |
|---|---|---|
| `admin@efficio.demo` | Efficio super admin | Every organization |
| `ann@acme.demo` | Acme Exports admin | 6 bookings (3 on MAERSK HOUSTON: see the Vessels tab), Team page |
| `bob@acme.demo` | Acme Exports member | Same bookings, no Team page |
| `gia@globex.demo` | Globex Shipping admin | 2 bookings (shares HOU1002 with Acme, but never sees Acme) |
| `max@maersk.demo` | Maersk Line (carrier) | Every Maersk booking; can verify Acme and Globex |

Password for all demo logins: `efficio-demo-2026`. **Demo data only**: it's created in an empty database and never with live Port Houston data.

The first time, GitHub may ask you to confirm creating the codespace. When you're done, stop it from github.com/codespaces so it doesn't use up your free monthly hours.

## Hosting
The team's hosted copy runs on **Render** (simulated data). Setup and day-to-day notes: [docs/deploy/render.md](docs/deploy/render.md).

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
| [Proposals](docs/proposals/) | Design proposals awaiting a team decision | `P-

### Status vocabulary
- **Questions:** `Open` → `Answered` (answer recorded + linked decision if any)
- **Stories:** `Draft` → `Ready` (questions resolved, acceptance criteria agreed) → `In progress` → `Done`
- **Risks:** `Open` → `Mitigated` / `Accepted` / `Closed`
