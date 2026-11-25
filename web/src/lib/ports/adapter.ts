import type { PortBookingSnapshot } from "@/lib/domain/types";

/** What identifies a booking: the carrier that issued it plus its number (D-015). */
export interface BookingRef {
  carrierCode: string;
  bookingNumber: string;
}

/**
 * One adapter per port, terminal or data provider (D-003).
 * The rest of the app only talks to this interface.
 */
export interface PortAdapter {
  /** Short identifier stored with each snapshot, e.g. "mock" or "navis-evp". */
  readonly source: string;
  /** Human-readable name for the UI. */
  readonly displayName: string;
  lookupBooking(ref: BookingRef): Promise<PortBookingSnapshot>;
}

/** Raised when an adapter can't serve a request yet, e.g. endpoints still unconfirmed. */
export class AdapterNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterNotReadyError";
  }
}
