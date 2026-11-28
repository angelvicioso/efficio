import { AccountService } from "./auth/accounts";
import { BookingService } from "./bookings";
import { getDb } from "./db";
import { Mailer } from "./email/mailer";
import { Notifier } from "./email/notifier";
import { getPortAdapter } from "./ports";
import { publicBaseUrl } from "./publicUrl";

let bookings: BookingService | null = null;
let accounts: AccountService | null = null;
let mailer: Mailer | null = null;
let notifier: Notifier | null = null;

/** Public address for links in emails (no request to read it from in background jobs). */
export function linkBase(): string {
  return publicBaseUrl() ?? `http://localhost:${process.env.PORT ?? "3000"}`;
}

export function accountService(): AccountService {
  accounts ??= new AccountService(getDb());
  return accounts;
}

export function mailService(): Mailer {
  mailer ??= new Mailer(getDb());
  return mailer;
}

export function bookingService(): BookingService {
  if (!bookings) {
    bookings = new BookingService(getDb(), getPortAdapter());
    notifier = new Notifier(getDb(), accountService(), bookings, mailService(), linkBase);
    const n = notifier;
    bookings.onSnapshot = (id) => n.onSnapshot(id);
  }
  return bookings;
}

export function notificationService(): Notifier {
  bookingService();
  return notifier!;
}
