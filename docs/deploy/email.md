# Email: Postmark and your domain

_Last updated: 2026-11-28 · Owner: Eduardo (setup), Javier (domain purchase) · Decision: D-037_

Efficio sends five kinds of email: **invites**, **password resets** (admin-issued and "Forgot password?"), **exception alerts**, a **daily summary** (7 AM Houston time), and **date-change** alerts.

Until the steps below are done, Efficio runs in **preview mode**: every email is recorded and visible to super admins under **All organizations → Emails sent by Efficio**, but nothing actually goes out.

## 1. Buy a domain (Javier)
- Any registrar works (e.g. Cloudflare Registrar, Namecheap, Squarespace Domains), typically about $10–20 a year.
- Choose the name you'll use for Efficio long-term. The same domain can later serve the app itself (e.g. `app.yourdomain.com` on Render).
- Make sure one of you can **add DNS records** at the registrar.

## 2. Set up Postmark (Eduardo)
1. Create an account at **postmarkapp.com**, and a **Server** (e.g. "Efficio").
2. Under **Sender Signatures → Domains**, add your domain. Postmark shows two DNS records to add at your registrar:
   - a **DKIM** record (TXT), which proves the emails really come from your domain
   - a **Return-Path** record (CNAME), which handles bounces
   
   Add both exactly as shown, then press **Verify** in Postmark. DNS can take minutes to a few hours.
3. Recommended: also add a **DMARC** record (TXT at `_dmarc.yourdomain.com`, e.g. `v=DMARC1; p=none;`), which helps delivery.
4. **Account approval:** I believe new Postmark accounts start in a restricted test mode until Postmark reviews them, and can only send to addresses at your own domain until then. Request approval from the Postmark dashboard; it usually asks what you send (transactional alerts, invites, password resets). Check Postmark's current rules on their site.
5. In your Server, open **API Tokens** and copy the **Server API token**.

## 3. Switch Efficio to Postmark (Render → efficio → Environment)
| Key | Value |
|---|---|
| `EMAIL_MODE` | `postmark` |
| `POSTMARK_SERVER_TOKEN` | the Server API token (keep it secret; never in the repo) |
| `EMAIL_FROM` | e.g. `Efficio <alerts@yourdomain.com>` (must be on the verified domain) |

Save; Render redeploys. Then test it:
- On **All organizations**, invite yourself at a second email address, or press **Reset password** next to another super admin.
- Check **Emails sent by Efficio**: the status should say **sent**. **failed** shows Postmark's reason, e.g. "Sender signature not confirmed."

## Turning it off
Set `EMAIL_MODE=preview` (record only) or `EMAIL_MODE=off` (nothing at all). While email is off, alerts aren't counted as sent, so switching back on starts fresh.

## Who gets what
| Email | Who | When |
|---|---|---|
| Invite | the invited person | when an admin creates the invite (the copy-link stays as a backup) |
| Password reset | the person | when an admin presses Reset password, or they use "Forgot password?" (max 3 an hour) |
| Exception alert | people at each company following the booking, with alerts on | once when a booking first turns critical (24h before cutoff, or a missed cutoff); again only if the cutoff changes |
| Daily summary | same | once a day from 7 AM Houston time, only if something needs attention |
| Date change | same | when the terminal changes receiving opens or a cutoff |

People turn alerts on/off by clicking their name (top right) → **Account**. Super admins don't get booking alerts.
