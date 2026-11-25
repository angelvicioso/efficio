import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { bookingService } from "@/lib/service";

/**
 * Manual trigger for the scheduled refresh (S-012, D-017). The app already refreshes on its own
 * every REFRESH_INTERVAL_MINUTES; this endpoint is for an external scheduler if the app runs serverless.
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
  return NextResponse.json(await bookingService().refreshDue());
}
