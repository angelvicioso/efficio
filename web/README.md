# Efficio Web App (POC)

Exporters add a booking number and see the receiving window and cutoffs that Port Houston's terminal reports.

## Run it
Requires **Node 22.13+** (uses Node's built-in SQLite).

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

By default the app uses **simulated Port Houston data** (`PORT_ADAPTER=mock`). Try these booking numbers:

| Booking | Scenario |
|---|---|
| `HOU1001` | Receiving not open yet |
| `HOU1002` | Receiving open |
| `HOU1003` | Closing soon (under 48h) |
| `HOU1004` | Receiving closed |
| `HOU1005` | Cutoff moves 12h earlier on every refresh (shows change detection) |
| anything else | Not yet at terminal |

Other commands: `npm test` (unit tests), `npm run typecheck`, `npm run build && npm start`.

## Configuration
Copy `../.env.example` to `web/.env.local` and fill it in. Never commit it.

| Variable | Purpose |
|---|---|
| `PORT_ADAPTER` | `mock` (default) or `navis` for live Port Houston data |
| `PORT_HOUSTON_EVP_*` | Navis N4 EVP connection (see `docs/integrations/port-houston.md`) |
| `EFFICIO_DB_PATH` | SQLite file location (default `web/.data/efficio.db`) |
| `REFRESH_TOKEN` | Secret for `POST /api/refresh-all`, used by a scheduler to refresh every booking |

## How the code is organized
```
src/lib/domain/       Efficio's own data model, receiving-window status, change detection
src/lib/ports/        Port adapters (D-003): one interface, many sources
  mock.ts             Simulated Port Houston data
  navis/evpClient.ts  Navis N4 EVP client: token caching, paged queries, 401 retry
  navis/adapter.ts    Live adapter: waits on booking/vessel visit endpoints (S-013)
src/lib/bookings.ts   Add, refresh, list and remove bookings; every refresh is stored as a snapshot
src/app/              Pages (list, booking detail), server actions, refresh API
```

## Not built yet
- **Login (S-005).** There are no user accounts, so **don't put this on the public internet** with real data.
- **Live Port Houston lookups.** Needs the N4 booking and vessel visit endpoints (Q-021, S-013).
- **Automatic refresh schedule.** The endpoint exists; a scheduler still needs to call it (Q-006).
- **Alerts (S-021).**
