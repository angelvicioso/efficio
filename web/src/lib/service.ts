import { BookingService } from "./bookings";
import { getDb } from "./db";
import { getPortAdapter } from "./ports";

let service: BookingService | null = null;

export function bookingService(): BookingService {
  service ??= new BookingService(getDb(), getPortAdapter());
  return service;
}
