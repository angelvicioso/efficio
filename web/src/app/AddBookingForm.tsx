"use client";

import { useActionState } from "react";
import { addBookingAction, type AddBookingState } from "./actions";

const initial: AddBookingState = { error: null };

export function AddBookingForm() {
  const [state, action, pending] = useActionState(addBookingAction, initial);
  return (
    <form action={action} className="add-form">
      <label htmlFor="bookingNumber">Track a booking</label>
      <div className="add-row">
        <input
          id="bookingNumber"
          name="bookingNumber"
          placeholder="Booking number, e.g. HOU1002"
          autoComplete="off"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "add-error" : undefined}
        />
        <button type="submit" disabled={pending}>
          {pending ? "Checking…" : "Track"}
        </button>
      </div>
      {state.error && (
        <p id="add-error" className="form-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
