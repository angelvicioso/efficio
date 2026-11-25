# Product Brief: Efficio

_Last updated: 2026-11-25 · Status: Draft — pending answers in [Open questions](02-open-questions.md)_

## One-liner
A shared workspace where every party touching an export shipment sees the same booking status — starting with giving exporters direct visibility into what the port/terminal says about their cargo.

## The problem (as understood so far)
Exporters hold the commercial relationship and the booking, but the operational truth about their cargo is spread across many systems: the ocean carrier's portal, each terminal's website, the trucker's dispatch, the warehouse's WMS. Today the exporter learns about problems (cutoff changes, holds, rolled cargo, missed gate-in) late, often secondhand.

## Entities
| Entity | Role in the flow | In POC? |
|---|---|---|
| **Exporter** | Owns the booking; primary user | ✅ Primary user |
| **Port / Terminal** | Source of operational data (receiving windows, cutoffs, gate events, holds, load status) | ✅ Data source (integration) |
| Ocean carrier | Issues the booking, owns vessel schedule | ❓ See Q-008 |
| Trucking carrier | Moves containers between warehouse and terminal | ❓ Later |
| Warehouse | Stuffs/loads containers | ❓ Later |

## POC scope (proposed)
1. Exporter can sign in and add a booking by **booking number** (D-007).
2. Platform pulls data about that booking from the **Port Houston** API (Barbours Cut and Bayport terminals) (D-006).
3. Exporter sees the booking's **receiving window and cutoffs** clearly, plus whether the terminal has the booking on file (D-008).
4. Data refreshes on a schedule; changes are visible (and possibly alerted).

## Out of scope (proposed, for now)
- Logins for carriers, truckers, warehouses
- Creating/amending bookings (we only *read* status)
- Billing, documents, customs filing

## Success criteria for the POC
_To be defined — see Q-005._
