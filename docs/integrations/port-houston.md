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

## Reference documents received (2026-11-25)
Two Navis documents, kept out of the repo (vendor material): the **NSP API Developer Guide** (generic Navis guide, not Port Houston-specific) and an **API Endpoints** list. Summary:

### REST endpoints (all `GET` unless noted, under the EVP base URL)
| Area | Endpoint | What it gives Efficio |
|---|---|---|
| **Vessels** | `/vessel/vesselvisits` | Vessel calls. Each has `lines[]`, **one per carrier**, with `beginReceive` (ERD), `cargoCutoff`, `reeferCutoff`, `hazCutoff`, `emptyPickup`, voyage numbers. **This is where the receiving window and cutoffs live.** Also `visitPhase`, `publishedEta/Etd`, `estMoveCount` (vessel-wide move estimates). |
| | `/vessel/vesselvisits/active`, `/itinerary`, `/berthing`, `/vessel/vessels` | Active calls, schedules, berths |
| **Orders** | `/orders/bookings` | Bookings (link a booking to its vessel visit; likely quantities). **Field names not documented yet.** |
| | `/orders/serviceorder` | Service orders |
| **Inventory** | `/inventory/units` | Containers: full/empty, category (EXPRT), routing, location |
| | `/inventory/moveevents`, `/inventory/workinstructions`, `/inventory/units/equiptype` | Container moves (e.g. loaded onto vessel), planned moves, equipment types |
| **Gate (road)** | `/road/gatetransactions`, `/road/truckvisits`, `/road/gateappointments`, `/road/appointmenttimeslots` | **Empties picked up and loads dropped off** at the gate, truck visits, appointments |
| **Cargo** | `/cargo/billsoflading` | Bills of lading |
| **Other** | `/service/events`, `/argo/ecevents`, `/rail/...` | Service events, equipment control events, rail |
| **Notify** | `/notify/subscribers` (GET/POST/PUT/DELETE), `/notify/subscribers/{id}/{filterId}` | Subscriptions for **real-time change events** |

### Real-time streaming
- Subscribe to N4 business events (e.g. `VesselVisit`, `Booking`, `EquipmentOrderItem`, `Unit`, `TruckTransaction`, `GateAppointment`) with `POST /notify/subscribers`, then receive them over a **websocket** at `wss://<server>/notify/stream?groupId=…&id=<subscriptionId>`.
- Filters: by event name, by **which fields changed** (e.g. only `cargoCutoff` or `beginReceive`), and by predicates (simple `field=value` or JSON path expressions with `&&`/`||`).
- Each message carries the changed fields with **old and new values**, which maps directly onto "what changed" (S-020) and alerts (S-021).
- Operational notes: the client must send periodic pings (idle connections drop after **10 minutes**); a `groupId` + `offset` lets a client resume where it left off after a disconnect.
- Implication: streaming needs a **long-running server process** (D-016, Q-034). Polling the REST endpoints works on any hosting.

### Queries
- `operator=POHA` plus `predicate=field=value,...` (comma-separated) and `fields=a,b,c` to trim the response; results are paged.
- **Instance security:** the API *can* scope results to business units (e.g. a line operator or trucker) via a `bizroles` predicate. **If no scope is sent, results include every company's data.** Efficio must never pass that through: it scopes by booking and carrier itself (P-001, R-017).

### Auth differences to confirm
The generic guide shows 30-minute access tokens **with** refresh tokens (12h). Port Houston's own access document showed 4-hour tokens **without** refresh. Our client re-authenticates with client credentials either way, so both work.

### What this means for our stories
| Need | Likely source in N4 | Confidence |
|---|---|---|
| Is the booking on file? (S-002) | `/orders/bookings` | ✅ Endpoint known; ❓ field names (Q-021) |
| Receiving window and cutoffs (S-002, S-003) | `/vessel/vesselvisits` → `lines[]` for the booking's carrier | ✅ **Confirmed**; mapping built and tested (`navis/vesselVisits.ts`) |
| Earliest empty pickup date | `lines[].emptyPickup` on the vessel visit | ✅ Confirmed (new field for E-05) |
| Containers on a booking (S-041, S-042) | `/inventory/units` filtered by booking | ✅ Endpoint known; ❓ booking field name |
| Empties picked up / loads dropped (S-041) | `/road/gatetransactions`, or booking item tallies via `EquipmentOrderItem` | ✅ Endpoints known; ❓ fields; only covers the terminal gate (Q-033) |
| Loaded on vessel (S-041) | `/inventory/moveevents` | ✅ Endpoint known; ❓ fields |
| Real-time alerts (S-021) | Notify subscriptions + websocket | ✅ Available (Q-034) |

**Update:** R-010 is resolved. Receiving dates come from the vessel visit, which exists before any container arrives.

**Original callout (R-010):** `inventory/units` only lists containers the terminal already knows about. **Before the exporter's container arrives, there may be no units for the booking.** That's exactly the period the receiving window covers, so units alone can't support the POC's first feature. We need the booking and vessel visit data too.

## Field mapping (from Port Houston's real responses, 2026-11-25)
All five endpoints answered (100 records per page). **Every list contains all companies' records** (gate moves even include shipper names), so the adapter keeps only exact matches on the booking (R-017).

| Efficio | N4 source | Notes |
|---|---|---|
| Booking found | `orders/bookings` → `nbr` = booking number **and** `lineScac` = carrier SCAC | `lineId` is Port Houston's own 3-letter line code; vessels use that |
| Vessel | booking `visit.visitId` → `vessel/vesselvisits` `visitId`; `vesName` (trimmed), voyage `lines[].lineOutVoyNbr` or `obVyg` | |
| Terminal | vessel `facility` / booking `visit.facilityId` | `BPT` = Bayport (confirmed by token scope); `BCT` = Barbours Cut (assumed) |
| Receiving opens, cutoffs | booking `timeBeginReceive` / `timeCargoCutoff` / `timeReeferCutoff` / `timeHazCutoff` if set; else vessel `lines[]` for the booking's `lineId`; else the vessel's own `beginReceive` / `cargoCutoff` / `hazCutoff` | **Dates are epoch numbers** (milliseconds) |
| Booked equipment | booking `items[]`: `qty`, `sampleEquipTypeId` (e.g. 45G1) | |
| Empties picked up / loads received (counts) | booking `tally` / `tallyReceive` | The terminal's own running counts |
| Container list | `inventory/units` with `departOrderNbr` = booking: `unitId`, `freightKind`, `transitState` (S30–S50 at terminal, S60+ loaded), `timestamps.timeIn` / `timeOfLoading` | |
| Gate moves | `road/gatetransactions` with `eqoNbr` = booking: `subType` DM = empty out, RE = full in; `ctrId`, `handled` | **DM confirmed** 2026-11-26; RE still to confirm with a delivered container |

### Extra fields (D-038, to verify with real held / rolled / reefer containers)
| Efficio | N4 source |
|---|---|
| Holds | unit `impediments.impedimentRoad/Vessel/Rail`, `stopFlags.stoppedVessel/Road` |
| Rolled | unit `intendedObCvId` (or `actualObCvId`) ≠ the booking's `visit.visitId` |
| VGM | unit `vgmVerifiedDate`, `contents.goodsAndCtrWtKgVerifiedGross` |
| Storage | unit `ufvBilling.lastFreeDay` (or `lastFreeDay`, `ufvBilling.lineLastFreeDay`), `extras.dwellDays` |
| Reefer / hazmat | unit `requiresPower`, `reefer.isPowered`, `reefer.reeferRequirement.rfreqTempRequiredC`, `isHazardous` |
| Yard position | unit `lastKnownPosition.posName` |
| Trucker | gate move `trkcoId` |
| Vessel progress | vessel `visitPhase`, `ata`, `atd`, `berths[]`; late gate `lateArrivals[]` (shown as-is until its structure is known) |
| Gate appointments | `/road/gateappointments`, `/road/appointmenttimeslots`: **fields unknown**. Both were added to the connection check; run it and send the report |

## Charges used for money at risk (Tariff 14, effective Sep 1, 2026)

From Port Houston's published Tariff 14 (D-040, S-060). Re-check each September when the tariff is reissued. Defaults live in `web/src/lib/domain/rates.ts`.

| Charge | Rate | Source | When Efficio counts it |
|---|---|---|---|
| Export storage | $211.28 per container per 7 days ($279.95 for 53') | Subrule 093 | Only rolled export cargo stored over 7 days. Daily demurrage in the tariff is for imports. |
| Rehandling | $81.61 per container | Subrule 090 A2 | At risk if containers at the terminal get rolled |
| Reefer power | $41.12 per container per day | Subrule 090 A1 | At risk: reefers waiting for the next sailing |
| Exam move | $139.61 per container | Subrule 090 B1 | At risk: containers on a customs or exam hold |
| Weighing | $127.39 per container | Subrule 090 B3 | At risk: containers at the terminal with no VGM |

Carrier detention isn't Port Houston's charge. The default is Maersk's published US export tariff (3 free days, $360/day for 3 days, then $465/day), and each company should enter its own terms (Q-041). Chassis isn't a port charge either: each company enters its own per-day rate and free days (Q-043); until then it isn't counted.

## Going live: checklist
| # | Step | Owner | Status |
|---|---|---|---|
| 1 | **Permission**: confirm Efficio may show Port Houston data to exporters who use it, and that the credentials cover Barbours Cut as well as Bayport; ask about rate limits and whether they restrict access by IP address (Q-021) | Orlando | **Permission confirmed** (D-027); Barbours Cut, rate limits and IP rules still to confirm |
| 2 | **First real call**: add the `PORT_HOUSTON_EVP_*` settings in Render (keep `PORT_ADAPTER=mock`), then press **Test Port Houston connection** on the super admin page (works on a phone). Or on a laptop: credentials in `web/.env.local`, then `npm run port-houston:check`. Either way the report shows field names and value *formats* only, never real values, so it's safe to share | Eduardo | **Done 2026-11-25** (all five endpoints answered). Earlier: **blocked:** Render reached Port Houston, but sign-in returned `401 unauthorized_client: Invalid client or Invalid client credentials`. Client ID, secret length (32) and login address are correct. Likely a misread character in the secret (it was only available as an image) or credentials no longer active (the document's sample token dates from March 2025). Orlando to confirm `pha-efficio` is active and get the secret **as text**, or a reset. Don't retry guesses against their login server |
| 3 | **Field mapping**: from the check's output (or the Swagger UI / sample responses), map bookings → vessel visit → dates, and containers / gate moves → container progress | Claude | **Done** (table above) |
| 4 | **Build the live connection** (`navis/adapter.ts`) with tests based on the real shapes, including tests that one customer never gets another's data (R-017) | Claude | **Built**, with tests on mixed-company data; to verify with real bookings (step 5) |
| 5 | **Verify with real bookings**: on the super admin page, **Test a booking** with 2–3 bookings Orlando knows (one not yet at the terminal, one with containers delivered), and compare with Lynx | Eduardo + Orlando | **1 of 2–3 verified (2026-11-26):** booking 038NY1578254 (MSC, GSL SOFIA) mapped correctly: server-side filtering, vessel link, dates (local times look right), DM gate code, container. **Still needed:** a booking with a container delivered full / loaded (confirms RE and loading), and Orlando's comparison with Lynx |
| 6 | **Off-site backups** (D-031: before the first real customer, no longer before live data) | Claude + Eduardo | Moved: before first customer |
| 7 | **Switch Render to live**: add `PORT_HOUSTON_EVP_*` as secrets in Render, set `PORT_ADAPTER=navis`, remove sample data | Eduardo | **In progress 2026-11-26** (D-030). Watch: RE gate code and "loaded" status on the first delivered/loaded containers |

## Spike checklist (S-013)
- [x] Confirm who owns these credentials: Orlando, for Efficio (D-010)
- [ ] Orlando: get the API reference, coverage, permitted use and rate limits from the issuer (Q-021)
- [ ] Store the client secret in a password manager; create `web/.env.local`
- [ ] Run `npm run port-houston:check`: gets a token and calls each endpoint once
- [x] Find the endpoints for **bookings** and **vessel visits**, and the vessel visit field names for ERD and cutoffs (from the developer guide)
- [ ] Get the **Swagger UI** (the guide refers to it for full details) or sample responses for `/orders/bookings`, `/inventory/units`, `/road/gatetransactions`, `/inventory/moveevents` (Q-021)
- [ ] Confirm `lines[].lineId` uses SCAC codes (MAEU) or Port Houston's own line codes, and the date format
- [ ] Try a known booking number end to end: booking → vessel visit → dates
- [ ] Check coverage: Bayport only, or Barbours Cut as well? (Q-021)
- [ ] Booking **line items**: equipment type and **quantity booked** (e.g. 10 × 40' high cube), plus the counts of **empties released** and **loads received** against the booking, if N4 exposes them (S-041)
- [ ] `inventory/units` filtered by booking: container numbers, full/empty, where each is (yard, gated out, loaded), and gate-in/gate-out times (S-041, S-042). Find the booking field name for `predicate`.
- [ ] Note the rate limits, paging behavior and error formats
