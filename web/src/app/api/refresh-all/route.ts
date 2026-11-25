import { NextResponse } from "next/server";
import { bookingService } from "@/lib/service";

/**
 * Scheduled refresh (S-012): a cron job or scheduler POSTs here.
 * Set REFRESH_TOKEN and send it as "Authorization: Bearer <token>".
 */
export async function POST(request: Request) {
  const expected = process.env.REFRESH_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "REFRESH_TOKEN is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const refreshed = await bookingService().refreshAll();
  return NextResponse.json({ refreshed });
}
