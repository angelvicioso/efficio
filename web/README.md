# Efficio Web App (POC)

Exporters add a booking number and see the receiving window and cutoffs that Port Houston's terminal reports.

## Run it
Requires **Node 22.13+** (uses Node's built-in SQLite).

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

### First run
Open the app and you'll land on **/setup**, which creates the first **super admin**. That page disappears once any account exists. From there:
1. **All organizations** → create a customer organization (name, type, email domains).
2. On its **Team** page, create an invite link for their first admin and send it to them.
3. They open the link, set a password, and land in their own workspace.

### Who can do what
| | Super admin (Efficio team) | Org admin | Org member |
|---|---|---|---|
| See and track bookings | Every organization | Own org | Own org |
| Invite people, change roles, disable accounts | Every organization | Own org | — |
| Create organizations, change email domains | ✅ | — | — |
| Verify/remove companies on a booking | Carrier orgs only (on their own bookings) | | |
| Invite super admins | ✅ | — | — |

- Invites only go to emails on the organization's domains. Super admins can override this, e.g. for a consultant.
- Invite links work once and expire after 7 days. Efficio doesn't send email yet, so you copy the link and send it yourself.
- Sessions last 14 days. Disabling an account signs that person out immediately.

### Shared bookings (P-001)
- A booking is identified by **carrier + booking number** and is shared by every company that follows it.
- Exporters pick the carrier when adding a booking; they're attached as **claimed**.
- An **ocean carrier** organization (created with its carrier code) automatically sees every booking under that code, and can **verify** or **remove** the companies on it.
- Companies never see each other on a booking, and only see its history from when they joined. Only the carrier sees the full list.

### Simulated data
By default the app uses **simulated Port Houston data** (`PORT_ADAPTER=mock`). Try these booking numbers:

| Booking | Carrier | Scenario |
|---|---|---|
| `HOU1001` | MSC | Receiving not open yet |
| `HOU1002` | Maersk | Receiving open |
| `HOU1003` | Hapag-Lloyd | Closing soon (under 48h) |
| `HOU1004` | CMA CGM | Receiving closed |
| `HOU1005` | ONE | Cutoff moves 12h earlier on every refresh (shows change detection) |
| anything else, or the wrong carrier | | Not yet at terminal |

Other commands: `npm test` (unit tests), `npm run typecheck`, `npm run build && npm start`.

> **Upgrading?** From the logins version, the database upgrades itself on startup: accounts are kept and simulated bookings are reset. From the pre-login version, delete `web/.data/efficio.db`.

## Configuration
Copy `../.env.example` to `web/.env.local` and fill it in. Never commit it.

| Variable | Purpose |
|---|---|
| `PORT_ADAPTER` | `mock` (default) or `navis` for live Port Houston data |
| `PORT_HOUSTON_EVP_*` | Navis N4 EVP connection (see `docs/integrations/port-houston.md`) |
| `EFFICIO_DB_PATH` | SQLite file location (default `web/.data/efficio.db`) |
| `REFRESH_INTERVAL_MINUTES` | How often the server re-checks every followed booking (default `5`; `0` turns it off). Vessels that sailed over a day ago are skipped (D-017) |
| `REFRESH_TOKEN` | Secret for `POST /api/refresh-all`, to trigger a refresh from outside (only needed on hosting without a long-running server) |
| `EFFICIO_BASE_URL` | Public URL used in invite links (default: taken from the request) |
| `EFFICIO_INSECURE_COOKIES` | Set to `1` only to test a production build over plain http (not on localhost) |

## How the code is organized
```
src/lib/domain/       Efficio's own data model, receiving-window status, change detection
src/lib/ports/        Port adapters (D-003): one interface, many sources
  mock.ts             Simulated Port Houston data
  navis/evpClient.ts  Navis N4 EVP client: token caching, paged queries, 401 retry
  navis/adapter.ts    Live adapter: waits on booking/vessel visit endpoints (S-013)
src/lib/auth/         Accounts: organizations, users, invites, sessions, passwords, permissions
src/lib/bookings.ts   Add, refresh, list and remove bookings (always scoped to one organization)
src/app/admin/        Super admin console: all organizations, super admins
src/app/o/[org]/      One organization's workspace: bookings, booking detail, team
src/app/login, setup, invite/[token]   Sign-in, first-run setup, accepting an invite
```

## Not built yet
- **Email** (invites, password reset). Until then a super admin resets a password by disabling the account and sending a new invite.
- **Login rate limiting** (R-014). Add it before the app is on the public internet.
- **Live Port Houston lookups.** Needs the N4 booking and vessel visit endpoints (Q-021, S-013).
- **Alerts (S-021).**
