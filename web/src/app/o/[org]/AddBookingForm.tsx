import { CARRIERS, carrierName } from "@/lib/domain/carriers";
import { MAX_BATCH } from "@/lib/bookings";
import { ActionForm } from "../../ActionForm";
import { addBookingAction } from "./actions";

/** The carrier is found automatically unless chosen (D-033); carrier organizations can only add their own bookings. */
export function AddBookingForm({ org, fixedCarrier }: { org: string; fixedCarrier: string | null }) {
  return (
    <ActionForm action={addBookingAction} submitLabel="Track" pendingLabel="Checking…" className="add-form">
      <input type="hidden" name="org" value={org} />
      <label htmlFor="bookingNumbers">Track bookings</label>
      <div className="add-fields">
        {fixedCarrier ? (
          <span className="fixed-carrier">{carrierName(fixedCarrier)}</span>
        ) : (
          <select name="carrierCode" defaultValue="" aria-label="Carrier">
            <option value="">Find carrier automatically</option>
            {Object.entries(CARRIERS).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        )}
        <textarea
          id="bookingNumbers"
          name="bookingNumbers"
          rows={1}
          placeholder="One or more booking numbers, e.g. HOU1002"
          autoComplete="off"
          spellCheck={false}
          required
          aria-describedby="bookingNumbers-hint"
        />
      </div>
      <p id="bookingNumbers-hint" className="add-hint small muted">
        Paste a list (one per line, or separated by commas or spaces), up to {MAX_BATCH} at a time.
      </p>
    </ActionForm>
  );
}
