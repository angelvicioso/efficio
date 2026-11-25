import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { bookingService } from "@/lib/service";

/**
 * Scheduled refresh (S-012) for every organization's bookings: a cron job or scheduler POSTs here.
 * Set REFRESH_TOKEN and send it as "Authorization: Bearer <token>".
 */
export async function POST(request: Request) {
  const expected = process.env.REFRESH_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "REFRESH_TOKEN is not configured" }, { status: 503 });
  }
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${expected}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const refreshed = await bookingService().refreshAll();
  return NextResponse.json({ refreshed });
}
