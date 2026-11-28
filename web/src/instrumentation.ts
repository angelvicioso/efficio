/**
 * Next.js calls register() once when the server starts. We use it to start the
 * Port Houston refresh schedule (D-017). Set REFRESH_INTERVAL_MINUTES=0 to turn it off.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Shown in the hosting logs on every start, so a wrong data source is easy to spot (D-039).
  const { dataSourceSetting } = await import("./lib/ports");
  const ds = dataSourceSetting();
  console.log(`[data] using ${ds.kind} Port Houston data (PORT_ADAPTER=${JSON.stringify(ds.raw)})`);

  const { refreshIntervalMinutes, startScheduler } = await import("./lib/scheduler");
  const minutes = refreshIntervalMinutes();
  if (minutes === 0) {
    console.log("[refresh] automatic refresh is off (REFRESH_INTERVAL_MINUTES=0)");
    return;
  }
  const { bookingService, notificationService } = await import("./lib/service");
  startScheduler(minutes * 60_000, async () => {
    const started = Date.now();
    const { refreshed, skipped } = await bookingService().refreshDue();
    console.log(`[refresh] ${refreshed} booking(s) refreshed, ${skipped} finished skipped, in ${Date.now() - started} ms`);
    // Morning summaries go out on the first run after 7 AM Houston time (D-037).
    const summaries = await notificationService().sendDailySummaries();
    if (summaries) console.log(`[email] daily summary sent to ${summaries} compan${summaries === 1 ? "y" : "ies"}`);
  });
  console.log(`[refresh] refreshing tracked bookings every ${minutes} minute(s)`);
}
