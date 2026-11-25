# P-001: Shared Bookings Across Organizations

_Status: **Proposed**, awaiting team decision · Author: Claude (business analyst) · Raised by: Eduardo · 2026-11-25_

## The problem
One exporter books with several carriers, and each carrier has many exporters as customers. The same booking matters to several companies at once (the exporter, the carrier, and later the trucker, terminal and warehouse). Each company should see **only the bookings it is part of**, and within those, **only the data meant for its role**.

Today (D-013) each booking belongs to exactly one organization. That works for exporters alone, but breaks as soon as a carrier joins: the carrier would need its own copy of every booking, and the copies would drift apart.

## The idea: workspaces stay, bookings become shared
These are two separate questions:

| Question | Answer | Mechanism |
|---|---|---|
| **Who are you?** Your company, users, roles, settings, private notes | Your organization's workspace | **Tenancy** (built, D-013) |
| **Which shipments can you see?** | The bookings your organization is a **party** to | **Party access** (proposed) |

Think of a shared document: everyone has their own drive (workspace), but a document is shared with specific people. A booking is one shared record, and each company that's part of it sees it inside its own workspace.

**Example:** Acme Exports books with Maersk and MSC. Maersk also serves Globex.
- Acme sees its Maersk and MSC bookings.
- Maersk sees its Acme and Globex bookings.
- Globex sees only its own Maersk booking. It never sees Acme.
- MSC sees only Acme's MSC booking.

## Proposed data model
```
bookings            one record per real booking: carrier code + booking number (unique together)
  └─ snapshots      port data, fetched ONCE per booking and shared by every party
booking_parties     which organizations are on a booking, and in what role
                    (exporter, carrier, trucker, terminal, warehouse, forwarder)
                    + status: claimed | verified, + who added them
party_data          each organization's private info about a booking
                    (internal reference, PO, notes): visible only to that organization
```
**Access rule:** you can see a booking if and only if your organization is a party to it. What you see within it depends on your role (matrix below).

**Bonus:** if five companies track the same booking, we call Port Houston once, not five times.

## Draft visibility matrix (for Orlando to correct, Q-028)
| Data | Exporter | Carrier | Trucker | Terminal | Warehouse |
|---|---|---|---|---|---|
| Port data: receiving window, cutoffs, on-file status | ✅ | ✅ | ✅ | ✅ (source) | ✅ |
| Vessel, voyage, container count | ✅ | ✅ | ✅ | ✅ | ✅ |
| Container numbers | ✅ | ✅ | Only containers assigned to them | ✅ | Only containers they load |
| Commodity, weight, hazmat/reefer details | ✅ | ✅ | Needed for safety: ✅ | ✅ | ✅ |
| Commercial: cargo value, PO, end customer, rates | ✅ | Rates only | ❌ | ❌ | ❌ |
| Your own private notes and references | Own only | Own only | Own only | Own only | Own only |

## The trust problem (the hard part)
If an exporter can add any booking number, they could add **someone else's** booking and see its data.
- **Today this is low-risk.** Exporters only see port data. Whether that's sensitive depends on what Port Houston already shows publicly (Q-029).
- **It becomes high-risk** once bookings hold shared data from other parties (carrier notes, container assignments, commercial info).

**Proposal: two levels of party link**
| Status | How you get it | What you see |
|---|---|---|
| **Claimed** | You typed in the booking number (today's flow) | Port data only, plus your own private notes |
| **Verified** | The carrier confirmed you (in Efficio, or through its booking feed), or someone verified added you | Everything your role allows |

During the POC every exporter link is **claimed**, which equals what the app already shows, so nothing is exposed. Verification matters once carriers join (E-04).

**Who can add parties:** the carrier (it issues the booking) and the verified exporter. Either can add a trucker or warehouse to that booking only.

## Domain callout: freight forwarders
Many exporters don't book with the carrier directly. A **freight forwarder or NVOCC** holds the booking with the carrier and resells space. Then the carrier's customer is the forwarder, not the exporter, and the forwarder may have its own booking number for the exporter (house vs. master). The model handles this with a `forwarder` party role, but Orlando should confirm how common it is (Q-030).

## What changes in the app
| Area | Change | Size |
|---|---|---|
| Add booking | Exporter picks the **carrier** plus the booking number (Q-017 becomes required) | Small |
| Database | `bookings` (shared) + `booking_parties` + `party_data`; snapshots move to the shared booking | Medium |
| Access checks | "Booking belongs to my org" becomes "my org is a party" | Small (one place) |
| Views | Filter fields by role (matrix) | Medium; can wait until a second role exists |
| Super admins | Unchanged: they see everything | — |

**Recommendation:** make the data model change **now**, while there's no real data and only one screen depends on it. Role-based field filtering and verification can wait until carriers actually join.

## Decisions needed
1. Adopt this model? (Eduardo, Q-027)
2. Q-017: carrier required when adding a booking. Recommended: **yes**, because it's now part of what identifies a booking.
3. Q-028 (visibility matrix), Q-029 (who can see terminal data today) and Q-030 (forwarders), all for Orlando.
