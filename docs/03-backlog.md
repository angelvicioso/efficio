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
| S-001 | As an **exporter**, I want to **add a booking by booking number and terminal**, so that the platform starts tracking it. | Q-001, Q-003 | Draft |
| S-002 | As an **exporter**, I want to **see everything the terminal reports about my booking** (raw data), so that I have the same information the terminal has. | Q-002, Q-004 | Draft |
| S-003 | As an **exporter**, I want a **simple status timeline** (receiving opens → cutoff → gated in → loaded → departed), so I can understand where my cargo is at a glance. | Q-004 | Draft |
| S-004 | As an **exporter**, I want a **list of all my tracked bookings** with key dates and status, so I can spot problems across shipments. | Q-007 | Draft |
| S-005 | As an **exporter**, I want to **sign in to my company account**, so my bookings are private. | Q-010 | Draft |

### E-02 · Port/terminal data integration
| ID | Story | Blocked by | Status |
|---|---|---|---|
| S-010 | As the **platform**, I want a **port adapter interface** so each terminal (or aggregator) can be plugged in without changing the app. | — | Draft |
| S-011 | As the **platform**, I want a **first adapter** for the chosen terminal (live or mocked). | Q-001, Q-002 | Draft |
| S-012 | As the **platform**, I want to **refresh booking data on a schedule** and store each snapshot, so we have history. | Q-006 | Draft |

### E-03 · Change detection & alerts
| ID | Story | Blocked by | Status |
|---|---|---|---|
| S-020 | As an **exporter**, I want to **see what changed** since the last update (e.g., cutoff moved), so I don't miss critical changes. | Q-006 | Draft |
| S-021 | As an **exporter**, I want to be **notified** (email/in-app) when a key date or status changes. | Q-006 | Draft |
