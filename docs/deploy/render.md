# Deploying Efficio to Render

_Last updated: 2026-11-25 · Owner: Eduardo · Decisions: D-023 (hosting), D-024 (protected setup)_

The repository contains a **Render Blueprint** (`render.yaml`) that describes the whole service, so Render sets it up for you: one always-on Node server in Ohio (closest region to Houston), a 1 GB disk for the database file, the 5-minute refresh, a health check, and two random secrets.

**Cost (check current prices on render.com):** Starter instance (about $7/month) plus the 1 GB disk (cents per month). The free plan won't work: it sleeps when idle and has no permanent disk.

## One-time setup (about 15 minutes)
1. **Sign up** at **dashboard.render.com** with **GitHub**, as `angelvicioso`. When GitHub asks which repositories Render may access, choose **Only select repositories → `efficio`**.
2. In Render, click **New → Blueprint** and pick the **`angelvicioso/efficio`** repository.
3. Render reads `render.yaml` and shows one web service, **efficio**, with a disk. Add a payment method and click **Apply**.
4. **Wait for the first deploy** (about 3–5 minutes). In the service's **Logs**, you should see:
   ```
   [refresh] refreshing tracked bookings every 5 minute(s)
   ```
5. **Find the app's address** at the top of the service page, e.g. `https://efficio-abcd.onrender.com`.
6. **Create your super admin account:**
   - Open the service's **Environment** tab, reveal **`EFFICIO_SETUP_TOKEN`** and copy it.
   - Open `https://<your-address>/setup?token=<the token>` and create your account. Use a **strong, new password**, not the demo password.
   - Without the token, `/setup` only says "Setup link required", so nobody else can claim the new server first. Once an account exists, setup is closed for good.
7. **Invite Orlando and Javier** as super admins: **All organizations → Invite a super admin**, then send them the links.
8. **Optional: add sample data.** On **All organizations**, click **Add sample data**. It creates Acme Exports, Globex Shipping and Maersk Line (carrier) with simulated bookings and containers, and **no logins**: you open them as a super admin, or invite people into them. **Remove sample data** deletes them again without touching real companies (D-026).

## Day to day
- **Deploys are automatic.** Every push to `claude/logistics-platform-poc-x95492` redeploys the app. Expect a few seconds of downtime per deploy, because the disk can only attach to one server at a time.
- **The data is simulated** (`PORT_ADAPTER=mock`). Live Port Houston data needs the booking fields (Q-021) and confirmation that Efficio may show the data to exporters (R-008).
- **Demo logins never exist on the hosted copy.** `npm run demo:seed` (whose password is in the README) refuses to run on Render. Use **Add sample data** (step 8) instead.
- **Backups (D-022):** Render takes daily snapshots of the disk. Check the disk's settings in Render to confirm and see how long they're kept. Database upgrades also write a safety copy next to the data file first.

## Testing the Port Houston connection
1. In **Environment**, add the five `PORT_HOUSTON_EVP_*` settings from `.env.example` (the client secret from Orlando's document). Keep `PORT_ADAPTER` as `mock`, so the app still shows simulated data. Save; Render redeploys.
2. Sign in as a super admin. On **All organizations**, find **Port Houston connection** and press **Test Port Houston connection**.
3. Press **Copy report** and send it to Claude. It shows ✓/✗ per data source and field names with masked formats, no real values.

## Changing settings
In the service's **Environment** tab:

| Variable | Set by | Purpose |
|---|---|---|
| `EFFICIO_DB_PATH` | Blueprint | Data file on the disk (`/var/data/efficio.db`) |
| `REFRESH_INTERVAL_MINUTES` | Blueprint | How often bookings refresh (default 5) |
| `PORT_ADAPTER` | Blueprint | `mock` (simulated) or `navis` (live, later) |
| `EFFICIO_SETUP_TOKEN` | Render (random) | Protects first-run setup |
| `REFRESH_TOKEN` | Render (random) | For `POST /api/refresh-all` (not needed on Render, since refresh runs inside the server) |
| `PORT_HOUSTON_EVP_*` | You, later | Port Houston credentials when going live. Add them as secrets in Render, never in the repo |

The app's public address is detected automatically from Render (`RENDER_EXTERNAL_URL`), so invite links use it.

## If something goes wrong
- **Deploy fails:** check **Logs** for the build output.
- **"Service unavailable":** the health check (`/api/health`) failed. Check **Logs**; the usual cause is the disk not being attached.
- **Locked out of every super admin account:** wait an hour (D-021), or ask Claude for help resetting through Render's **Shell** tab.

## If we merge to `main` later
Change `branch:` in `render.yaml` to `main`, and change the branch in Render's service settings to match.
