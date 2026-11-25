import { ActionForm } from "../../ActionForm";
import { addBookingAction } from "./actions";

export function AddBookingForm({ org }: { org: string }) {
  return (
    <ActionForm action={addBookingAction} submitLabel="Track" pendingLabel="Checking…" className="add-form">
      <input type="hidden" name="org" value={org} />
      <label htmlFor="bookingNumber">Track a booking</label>
      <input id="bookingNumber" name="bookingNumber" placeholder="Booking number, e.g. HOU1002" autoComplete="off" required />
    </ActionForm>
  );
}
