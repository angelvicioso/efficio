import { AccountService } from "./auth/accounts";
import { BookingService } from "./bookings";
import { getDb } from "./db";
import { getPortAdapter } from "./ports";

let bookings: BookingService | null = null;
let accounts: AccountService | null = null;

export function bookingService(): BookingService {
  bookings ??= new BookingService(getDb(), getPortAdapter());
  return bookings;
}

export function accountService(): AccountService {
  accounts ??= new AccountService(getDb());
  return accounts;
}
