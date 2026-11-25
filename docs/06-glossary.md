# Glossary

| Term | Meaning |
|---|---|
| **Booking** | A reservation of space on a vessel, issued by the ocean carrier to the exporter (shipper). Identified by a booking number. |
| **Terminal** | The facility within a port where containers are received, stored, and loaded onto vessels. A port typically has several. |
| **ERD (Earliest Return/Receiving Date)** | First date the terminal will accept the exporter's loaded container for a given vessel. |
| **Cargo cutoff (CY cutoff)** | Last date/time a loaded container can be gated into the terminal to make the vessel. |
| **Doc cutoff / SI cutoff** | Deadline for shipping instructions/documents to the carrier. |
| **VGM cutoff** | Deadline for submitting the Verified Gross Mass (container weight) — required by SOLAS. |
| **Gate-in / Gate-out** | When a container enters/exits the terminal through the truck gate. |
| **Hold** | A block preventing a container from moving (e.g., customs, carrier, terminal). |
| **Rolled** | Cargo bumped from its planned vessel to a later one. |
| **Bill of Lading (B/L)** | Transport document issued by the carrier; also a lookup reference. |
| **TOS** | Terminal Operating System — the software terminals use to manage operations (often the true source of port data). |
| **Data aggregator** | A third-party company that collects terminal/carrier data and exposes it through one API. |
| **Receiving window** | The period from ERD to cargo cutoff when the terminal accepts export containers for a vessel. Also called the "booking window" by the team. |
| **Port Houston** | The public port authority that owns and operates Houston's two container terminals, **Barbours Cut** and **Bayport**. |
| **Lynx** | Port Houston's web portal for customers, including a booking inquiry view. |
| **GetBookingInquiry** | Port Houston API call that checks whether an export booking is on file in the terminal system and returns routing details. |
| **Navis N4** | The terminal operating system Port Houston uses. The original source of terminal data. |
| **EVP API** | Navis's REST API for querying N4 data (e.g., `inventory/units`). Hosted on Navis Cloud. |
| **Unit** | N4's word for a container (or other piece of equipment) at the terminal. |
| **Vessel visit** | N4's record of one vessel call, which holds the receiving window and cutoffs. |
| **POD** | Port of discharge, where the container is unloaded. |
| **Organization** | One customer company on Efficio (e.g. an exporter), with its own bookings and users. Identified by its email domains. |
| **Super admin** | An Efficio team member who can see and manage every organization. |
| **Org admin / member** | A customer's users. Admins manage their team; members track bookings. |
