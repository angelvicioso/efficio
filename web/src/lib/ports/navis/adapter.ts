import { AdapterNotReadyError, type PortAdapter } from "../adapter";
import type { PortBookingSnapshot } from "@/lib/domain/types";
import { EvpClient } from "./evpClient";

/**
 * Live Port Houston adapter over the Navis N4 EVP API (D-010).
 *
 * Status: the token flow and paged queries are implemented. The booking and
 * vessel visit endpoints aren't in the access document, so mapping them into
 * receiving window and cutoffs waits on spike S-013 / Q-021.
 * `inventory/units` alone can't do it: before gate-in there are no units (R-010).
 */
export class NavisPortHoustonAdapter implements PortAdapter {
  readonly source = "navis-evp";
  readonly displayName = "Port Houston (live, Navis N4)";

  constructor(private readonly client: EvpClient = EvpClient.fromEnv()) {}

  async lookupBooking(bookingNumber: string): Promise<PortBookingSnapshot> {
    void bookingNumber;
    void this.client;
    throw new AdapterNotReadyError(
      "Live Port Houston lookups need the N4 booking and vessel visit endpoints (spike S-013). Use PORT_ADAPTER=mock for now.",
    );
  }
}
