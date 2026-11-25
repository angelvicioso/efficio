# Backlog

Stories are **Draft** until their blocking questions are answered and acceptance criteria are agreed.

## Epics
| ID | Epic | Status |
|---|---|---|
| E-01 | Exporter booking tracking (port visibility) | Draft |
| E-02 | Port/terminal data integration | Draft |
| E-03 | Change detection & alerts | Draft |
| E-04 | Multi-party collaboration (carriers, truckers, warehouses) | Future |

## Stories

### E-01 · Exporter booking tracking
| ID | Story | Blocked by | Status |
|---|---|---|---|
| S-001 | As an **exporter**, I want to **add a booking by booking number** (Port Houston), so that the platform starts tracking it. | Q-017 | Draft |
| S-002 | As an **exporter**, I want to **see my booking's receiving window (ERD to cargo cutoff) and cutoffs** as Port Houston reports them, plus whether the booking is on file at the terminal, so that I know when I can deliver and the deadline. | Q-018, R-006 | Draft |
| S-003 | As an **exporter**, I want a **countdown view of the receiving window** (not open yet, open with X days left, closing soon, closed), so I can act before the cutoff. A fuller timeline (gated in → loaded → departed) comes later. | Q-018 | Draft |
| S-004 | As an **exporter**, I want a **list of all my tracked bookings** with key dates and status, so I can spot problems across shipments. | Q-007 | Draft |
| S-005 | As an **exporter**, I want to **sign in to my company account**, so my bookings are private. | Q-010 | Draft |

### E-02 · Port/terminal data integration
| ID | Story | Blocked by | Status |
|---|---|---|---|
| S-010 | As the **platform**, I want a **port adapter interface** so each terminal (or aggregator) can be plugged in without changing the app. | — | Draft |
| S-011 | As the **platform**, I want a **Port Houston adapter** (booking inquiry, plus a vessel schedule lookup if needed), starting with a mock built from the official API documentation. | Q-019 | Draft |
| S-013 | **Spike (Eduardo):** register for Port Houston API access, read the docs, and confirm which fields give the receiving window and cutoffs, what the inputs are (carrier code?), the rate limits, and whether there's a test environment. | Q-019 | Draft |
| S-012 | As the **platform**, I want to **refresh booking data on a schedule** and store each snapshot, so we have history. | Q-006 | Draft |

### E-03 · Change detection & alerts
| ID | Story | Blocked by | Status |
|---|---|---|---|
| S-020 | As an **exporter**, I want to **see what changed** since the last update (e.g., cutoff moved), so I don't miss critical changes. | Q-006 | Draft |
| S-021 | As an **exporter**, I want to be **notified** (email/in-app) when a key date or status changes. | Q-006 | Draft |
