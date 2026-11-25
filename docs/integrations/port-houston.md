# Integration Notes: Port Houston

_Last updated: 2026-11-25 · Technical owner: Eduardo · Relationship owner: Orlando · Status: Credentials received; not yet tested_

> **No secrets in this file or anywhere in the repo.** Credentials live in a password manager and in a local `.env` file that git ignores. See `.env.example`.

## Two ways to get the data
| Path | What it is | Status |
|---|---|---|
| **A. Navis N4 EVP API** (this doc) | Direct REST access to the Navis N4 terminal operating system that Port Houston runs, hosted on Navis Cloud. Raw, flexible queries. | Access document received 2026-11-25. Client `pha-efficio`, issued to Orlando for Efficio (D-010). **Chosen path.** |
| B. Port Houston Data Integration APIs | Port Houston's published APIs, e.g. `GetBookingInquiry` (is a booking on file, plus routing details). Self-service registration. | Not requested. Fallback if A doesn't cover what we need. |

## Path A: Navis N4 EVP (from the "Getting Data" access document)

**Base URL:** `https://api.america.naviscloudops.com/v3/evp`

**Authentication:** OAuth2 *client credentials* flow against a Keycloak realm (`phaprod`).
- Token URL: `https://auth-v1.america.naviscloudops.com/auth/realms/phaprod/protocol/openid-connect/token`
- POST form fields: `client_id`, `client_secret`, `grant_type=client_credentials`
- Response: a Bearer `access_token`, valid for **4 hours** (`expires_in: 14400`), with **no refresh token**. The app should cache the token and request a new one shortly before it expires.
- Example scope: `nsp.POHA_BPT_PROD.all.all`. **POHA** = Port of Houston Authority, **BPT** = Bayport, **PROD** = production. This suggests the credentials cover **Bayport only** (see Q-021).
- The document also lists separate "N4 Authorization Credentials" (username/password, Base64). It doesn't say when those are used. To confirm during the spike.

**Example query: inventory units**
```
GET /v3/evp/inventory/units
    ?operator=POHA
    &predicate=routing.pod1Id=TWKHH          # filter: port of discharge = Kaohsiung
    &fields=unitId,category,routing.pod1Id   # only return these fields
Authorization: Bearer <token>
```
- Response: `{ "content": [ {unitId, category, routing:{pod1Id}} ... ], "paging": { "next": "<cursor>" } }`
- `category: "EXPRT"` marks export containers.
- Results are paged. Pass the `next` cursor to get more.

### What this means for our stories
| Need | Likely source in N4 | Confidence |
|---|---|---|
| Is the booking on file? (S-002) | A booking/order lookup. Endpoint not shown in the document. | ❓ Find in the spike (S-013) |
| Receiving window and cutoffs (S-002, S-003) | N4 stores these on the **vessel visit** (e.g., begin receive, cargo cutoff, reefer and hazmat cutoffs). Endpoint not shown. | ❓ Likely exists, needs checking (R-006) |
| Containers on a booking, after gate-in | `inventory/units`, filtered by a booking field with `predicate`. | ⚠️ Plausible; field name unknown |

**Key callout (R-010):** `inventory/units` only lists containers the terminal already knows about. **Before the exporter's container arrives, there may be no units for the booking.** That's exactly the period the receiving window covers, so units alone can't support the POC's first feature. We need the booking and vessel visit data too.

## Spike checklist (S-013)
- [x] Confirm who owns these credentials: Orlando, for Efficio (D-010)
- [ ] Orlando: get the API reference, coverage, permitted use and rate limits from the issuer (Q-021)
- [ ] Store the client secret in a password manager; create a local `.env`
- [ ] Get a token; check scope and expiry
- [ ] Find the endpoints for **bookings** and **vessel visits**; record the field names for ERD/begin receive and the cutoffs
- [ ] Try a known booking number end to end: booking → vessel visit → dates
- [ ] Check coverage: Bayport only, or Barbours Cut as well? (Q-021)
- [ ] Note the rate limits, paging behavior and error formats
