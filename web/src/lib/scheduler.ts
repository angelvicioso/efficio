/**
 * In-process refresh schedule (D-017): poll Port Houston at a short interval.
 * Runs inside the web server, so no separate cron service is needed. If a run is
 * still going when the next one is due, the next one is skipped rather than stacked.
 */

export const DEFAULT_REFRESH_MINUTES = 5;

export function refreshIntervalMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.REFRESH_INTERVAL_MINUTES;
  if (raw === undefined || raw.trim() === "") return DEFAULT_REFRESH_MINUTES;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_REFRESH_MINUTES;
}

export interface Scheduler {
  /** Runs once now (if nothing is running) and resolves when done. */
  tick(): Promise<void>;
  stop(): void;
}

export function startScheduler(
  intervalMs: number,
  run: () => Promise<unknown>,
  log: (msg: string) => void = (m) => console.log(m),
): Scheduler {
  let running = false;
  const tick = async () => {
    if (running) {
      log("[refresh] previous run still in progress; skipping this one");
      return;
    }
    running = true;
    try {
      await run();
    } catch (e) {
      log(`[refresh] failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  return { tick, stop: () => clearInterval(timer) };
}
