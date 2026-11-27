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
Either run `npm run demo:seed` for ready-made demo logins (below), or open the app and you'll land on **/setup**, which creates the first **super admin**. That page disappears once any account exists. From there:
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
- **Forgot password:** an admin presses **Reset password** next to the person (Team page, or All organizations for super admins) and sends them the link privately. It works once, expires in 24 hours, and signs them out everywhere else (D-032).
- **5 wrong passwords in a row lock that email for 1 hour** (D-021). Org admins can unlock their team on the Team page; super admins can unlock anyone.

### Shared bookings (P-001)
- A booking is identified by **carrier + booking number** and is shared by every company that follows it.
- Exporters just enter the booking number; Efficio finds the carrier at the port and asks only if it can't tell (D-033). They're attached as **claimed**.
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
| `HOU1005` | ONE | Cutoff moves 12h earlier on the next two refreshes (shows change detection) |
| `HOU1006` | Maersk | Another booking on MAERSK HOUSTON (vessel view) |
| `HOU1007` | MSC | MSC booking on MAERSK HOUSTON with its own, earlier cutoff (carriers share vessels) |
| anything else, or the wrong carrier | | Not yet at terminal |

Other commands: `npm test` (unit tests), `npm run typecheck`, `npm run build && npm start`.

> **Upgrading?** From the logins version, the database upgrades itself on startup: accounts are kept and simulated bookings are reset. From the pre-login version, delete `web/.data/efficio.db`.

## Demo data
**On a hosted server** (Render), use **Add sample data** on the super admin page instead: same companies and bookings, **no logins** (D-026). The command below refuses to run there.

`npm run demo:seed` fills an **empty** database with demo organizations, logins and simulated bookings (Codespaces does this automatically):

| Login | Who | What you'll see |
|---|---|---|
| `admin@efficio.demo` | Efficio super admin | Every organization |
| `ann@acme.demo` | Acme Exports admin | 6 bookings (3 on MAERSK HOUSTON: see the Vessels tab), Team page |
| `bob@acme.demo` | Acme Exports member | Same bookings, no Team page |
| `gia@globex.demo` | Globex Shipping admin | 2 bookings (shares HOU1002 with Acme, but never sees Acme) |
| `max@maersk.demo` | Maersk Line (carrier) | Every Maersk booking; can verify Acme and Globex |

Password for all demo logins: `efficio-demo-2026`. **Demo data only**: it's created in an empty database and never with live Port Houston data.

## Share a quick demo link
Give someone a temporary link to the app running on **your** computer, with nothing to install on their side.

1. Install Cloudflare's free tunnel tool once: `brew install cloudflared` (Mac) or `winget install --id Cloudflare.cloudflared` (Windows).
2. Start the tunnel: `cloudflared tunnel --url http://localhost:3000`. It prints a link like `https://some-words.trycloudflare.com`.
3. In a second terminal, start the app with that link:
   ```bash
   cd web
   npm run build
   EFFICIO_BASE_URL=https://some-words.trycloudflare.com npm start
   ```
   (Windows PowerShell: `$env:EFFICIO_BASE_URL="https://…"; npm start`)
4. Send them the link. They sign in with an account you created for them: create an invite on the Team page. Invite links will use the tunnel address.

Good to know:
- The link works **only while your computer is on and both commands are running**, and it changes each time you restart the tunnel.
- **Anyone with the link can reach the sign-in page.** Accounts are invite-only, but there's no limit on login attempts yet (R-014), so share it only with people you trust and stop the tunnel (Ctrl+C) when you're done.
- Use `npm start` (as above), not `npm run dev`, when sharing: dev mode shows detailed error pages.

## Configuration
Copy `../.env.example` to `web/.env.local` and fill it in. Never commit it.

| Variable | Purpose |
|---|---|
| `PORT_ADAPTER` | `mock` (default) or `navis` for live Port Houston data |
| `PORT_HOUSTON_EVP_*` | Navis N4 EVP connection (see `docs/integrations/port-houston.md`) |
| `EFFICIO_DB_PATH` | SQLite file location (default `web/.data/efficio.db`) |
| `REFRESH_INTERVAL_MINUTES` | How often the server re-checks every followed booking (default `5`; `0` turns it off). Vessels that sailed over a day ago are skipped (D-017) |
| `REFRESH_TOKEN` | Secret for `POST /api/refresh-all`, to trigger a refresh from outside (only needed on hosting without a long-running server) |
| `EFFICIO_BASE_URL` | Public address of the app (e.g. a tunnel or hosted domain). Used in invite links, and trusted for form submissions when the app sits behind a tunnel or proxy |
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
- **Email** (invites, self-service password reset). Until then, admins send invite and reset links themselves.
- **Live Port Houston lookups.** Needs the N4 booking and vessel visit endpoints (Q-021, S-013).
- **Alerts (S-021).**
