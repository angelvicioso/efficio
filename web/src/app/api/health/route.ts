import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * Health check for the hosting platform: confirms the server is up and the database file
 * is readable. Reveals nothing about accounts or bookings.
 */
export const dynamic = "force-dynamic";

export function GET() {
  try {
    getDb().prepare("SELECT 1").get();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
