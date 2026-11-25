import { CARRIERS, carrierName } from "@/lib/domain/carriers";
import { ActionForm } from "../../ActionForm";
import { addBookingAction } from "./actions";

/** Exporters pick the carrier (D-015); carrier organizations can only add their own bookings. */
export function AddBookingForm({ org, fixedCarrier }: { org: string; fixedCarrier: string | null }) {
  return (
    <ActionForm action={addBookingAction} submitLabel="Track" pendingLabel="Checking…" className="add-form">
      <input type="hidden" name="org" value={org} />
      <label htmlFor="bookingNumber">Track a booking</label>
      <div className="add-fields">
        {fixedCarrier ? (
          <span className="fixed-carrier">{carrierName(fixedCarrier)}</span>
        ) : (
          <select name="carrierCode" required defaultValue="" aria-label="Carrier">
            <option value="" disabled>
              Carrier…
            </option>
            {Object.entries(CARRIERS).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        )}
        <input id="bookingNumber" name="bookingNumber" placeholder="Booking number, e.g. HOU1002" autoComplete="off" required />
      </div>
    </ActionForm>
  );
}
