# Backlog

Stories are **Draft** until their blocking questions are answered and acceptance criteria are agreed.

## Epics
| ID | Epic | Status |
|---|---|---|
| E-01 | Exporter booking tracking (port visibility) | Draft |
| E-02 | Port/terminal data integration | Draft |
| E-03 | Change detection & alerts | Draft |
| E-04 | Multi-party collaboration (carriers, truckers, warehouses). Data model proposed in [P-001](proposals/P-001-shared-bookings.md). | Future; model proposed |

## Stories

### E-01 · Exporter booking tracking
| ID | Story | Blocked by | Status |
|---|---|---|---|
| S-001 | As an **exporter**, I want to **add a booking by its number** (Port Houston), so that the platform starts tracking it. | — | **Built (live)**: carrier found automatically, asked only when needed (D-033) |
| S-002 | As an **exporter**, I want to **see my booking's receiving window (ERD to cargo cutoff) and cutoffs** as Port Houston reports them, plus whether the booking is on file at the terminal, so that I know when I can deliver and the deadline. | Q-018, R-006 | **Built (mock)** |
| S-003 | As an **exporter**, I want a **countdown view of the receiving window** (not open yet, open with X days left, closing soon, closed), so I can act before the cutoff. A fuller timeline (gated in → loaded → departed) comes later. | Q-018 | **Built (mock)**, 48h threshold pending Q-022 |
| S-004 | As an **exporter**, I want a **list of all my tracked bookings** with key dates and status, so I can spot problems across shipments. | Q-007 | **Built (mock)** |
| S-044 | As an **exporter**, I want the **bookings list to show total containers, picked up and at terminal**, and to **sort by any column**, so I can see at a glance which bookings need empties or deliveries. | — | **Done**: sort kept in the page address; missing values last; status sorts by urgency |
| S-005 | As an **exporter**, I want to **sign in to my company account**, so my bookings are private. | — | **Done**: invite-only accounts, org workspaces, org admin/member roles |
| S-006 | As a **super admin**, I want to **create customer organizations, set their email domains, and open any of them**, so the Efficio team can onboard and support customers. | — | **Done** |
| S-007 | As an **org admin**, I want to **invite teammates, change roles and disable accounts**, so my company manages its own access. | — | **Done** (invite links are copied by hand until S-008) |
| S-008 | As a **user**, I want **invites and password resets by email**, so nobody has to pass links around by hand. | Q-025 | Draft |
| S-009 | As a **super admin**, I want an **activity log** of who did what (in particular super admins acting inside a customer's workspace), so we can answer customer questions and audits. | — | Draft |

### E-05 · Vessel & container progress
| ID | Story | Blocked by | Status |
|---|---|---|---|
| S-040 | As an **exporter**, I want to **group my bookings by vessel** and see how many bookings and containers I have on each, so I can plan around one sailing. | Q-032 | **Built (mock)**: Vessels tab groups bookings by vessel (across carriers), with schedule, next cutoff and status counts. Container totals wait on Q-032 and booking quantities from N4 |
| S-041 | As an **exporter**, I want to see **container progress per booking**: booked → empties picked up → loaded containers dropped at the terminal → loaded on the vessel, so I know what's left to deliver before the cutoff. | Q-033, S-013 | **Built (mock)**: per booking, vessel and carrier, with a progress bar and "still to deliver" (D-020). Live data waits on N4 container/gate fields (Q-021) |
| S-042 | As an **exporter**, I want the **list of container numbers** on each booking with their status and times, so I can match them to my trucker's moves. | S-013 | **Built (mock)**: expand a booking to see its containers, stages and times |
| S-043 | As an **exporter**, I want to **see my bookings grouped by carrier**, with booking and container totals, so I can manage each carrier relationship. | — | **Built (mock)**: Carriers tab (hidden for carrier organizations) |

### E-04 · Multi-party collaboration (P-001)
| ID | Story | Blocked by | Status |
|---|---|---|---|
| S-030 | As the **platform**, I want **one shared record per booking** that each involved company sees in its own workspace, so everyone works from the same data. | — | **Done** |
| S-031 | As a **carrier**, I want to **see every booking under my carrier code** that customers track, so I know who follows my bookings. | — | **Done** |
| S-032 | As a **carrier**, I want to **verify or remove the companies that claimed my bookings**, so only real parties get shared data. | — | **Done** |
| S-033 | As an **exporter**, I want to **add my trucker or warehouse to a booking**, so they see what they need without asking me. | Q-028 | Draft |
| S-034 | As any **party**, I want to see **only the fields my role needs** (visibility matrix in P-001). | Q-028 | Draft |
| S-035 | As any **company**, I want **private notes and my own references** (PO, internal job number) on a booking that only my company sees. | — | Draft |

### E-02 · Port/terminal data integration
| ID | Story | Blocked by | Status |
|---|---|---|---|
| S-010 | As the **platform**, I want a **port adapter interface** so each terminal (or aggregator) can be plugged in without changing the app. | — | **Done** |
| S-011 | As the **platform**, I want a **Port Houston adapter** using the Navis N4 EVP API (token handling, booking and vessel visit lookup), starting with a mock built from the documented response format. See [integration notes](integrations/port-houston.md). | Q-021 | **In progress**: mock done; token handling and paged queries done; booking/vessel visit mapping waits on S-013 |
| S-013 | **Spike (Eduardo):** with the Navis N4 EVP credentials, get a token and find the booking and vessel visit endpoints; confirm the fields for the receiving window and cutoffs, the inputs (carrier code?), coverage (Bayport/Barbours Cut), and rate limits. Checklist in [integration notes](integrations/port-houston.md). | Q-021 | Draft |
| S-012 | As the **platform**, I want to **refresh booking data on a schedule** and store each snapshot, so we have history. | — | **Done**: refreshes every 5 minutes (D-017), skips sailed vessels, manual refresh too |

### E-03 · Change detection & alerts
| ID | Story | Blocked by | Status |
|---|---|---|---|
| S-020 | As an **exporter**, I want to **see what changed** since the last update (e.g., cutoff moved), so I don't miss critical changes. | Q-006 | **Built (mock)** |
| S-021 | As an **exporter**, I want to be **notified** (email/in-app) when a key date or status changes. | Q-006 | Draft |
