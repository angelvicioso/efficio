# Callouts & Risks

## Risks
| ID | Risk | Impact | Mitigation idea | Status |
|---|---|---|---|---|
| R-001 | **Few ports/terminals offer public APIs.** Many publish data via web portals (often requiring login) or through third-party systems (e.g., terminal operating systems, port community systems). | Could block live data for the POC. | Confirm access early (Q-002); consider a data aggregator; build against a realistic mock first behind the adapter (D-003). | Open |
| R-002 | **Data is at the terminal level, not the port level**, and formats differ per terminal. | One "port integration" may actually be several. | Start with one terminal; normalize to our own data model. | Open |
| R-003 | **Booking vs. container identifiers.** Before gate-in, terminals know a booking; after, they track containers. | Tracking may break at gate-in if we only store booking #. | Capture container numbers once they appear in terminal data (Q-003). | Open |
| R-004 | **Terms of use / scraping.** Pulling from terminal websites without an agreement may violate terms. | Legal/relationship risk. | Use official APIs, aggregators, or partner agreements only. | Open |
| R-005 | **"Real-time" expectations.** Terminal data itself may only update periodically; rate limits apply. | Users may expect instant updates. | Define refresh target (Q-006); show "last updated" on every screen. | Open |

## Assumptions (to validate)
| ID | Assumption | Validate via |
|---|---|---|
| A-001 | Exporters already have the booking number from the carrier when they want to start tracking. | Q-003, Q-007 |
| A-002 | The exporter's biggest pain is late discovery of cutoff/receiving changes and holds. | Q-004, Q-007 |
| A-003 | A web app is acceptable for the POC. | Q-009 |
