import { AdapterNotReadyError, type BookingRef, type PortAdapter } from "../adapter";
import type { PortBookingSnapshot } from "@/lib/domain/types";
import { EvpClient } from "./evpClient";

/**
 * Live Port Houston adapter over the Navis N4 EVP API (D-010).
 *
 * Status:
 *  - Done: token flow, paged queries, vessel visit -> receiving window/cutoffs mapping (vesselVisits.ts).
 *  - Missing: the link from a booking to its vessel visit. GET /orders/bookings exists, but its
 *    fields (and the predicate to filter by booking number + line) aren't in the documents we have.
 *    Needs the Swagger UI or a sample response (Q-021, spike S-013).
 */
export class NavisPortHoustonAdapter implements PortAdapter {
  readonly source = "navis-evp";
  readonly displayName = "Port Houston (live, Navis N4)";

  constructor(private readonly client: EvpClient = EvpClient.fromEnv()) {}

  async lookupBooking(ref: BookingRef): Promise<PortBookingSnapshot> {
    void ref;
    void this.client;
    throw new AdapterNotReadyError(
      "Live Port Houston lookups need the field names of N4's /orders/bookings response to link a booking to its vessel visit (spike S-013). Use PORT_ADAPTER=mock for now.",
    );
  }
}
