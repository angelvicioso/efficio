import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_RATES, RATE_KEYS, defaultRates, type RateKey, type Rates } from "./domain/rates";

/** Each company's rates: Efficio defaults with the company's own overrides on top (D-040). */
export class RatesService {
  constructor(private readonly db: DatabaseSync) {}

  overrides(orgId: number): Partial<Record<RateKey, number>> {
    const rows = this.db.prepare("SELECT rate_key, value FROM org_rates WHERE org_id = ?").all(orgId) as { rate_key: string; value: number }[];
    return Object.fromEntries(rows.filter((r) => (RATE_KEYS as string[]).includes(r.rate_key)).map((r) => [r.rate_key, r.value]));
  }

  forOrg(orgId: number): Rates {
    return { ...defaultRates(), ...this.overrides(orgId) };
  }

  /** Sets a company's own value; null (or the default value) goes back to the default. */
  set(orgId: number, key: RateKey, value: number | null, userId: number | null): void {
    if (!RATE_KEYS.includes(key)) throw new Error(`Unknown rate ${key}`);
    if (value === null || value === DEFAULT_RATES[key].value) {
      this.db.prepare("DELETE FROM org_rates WHERE org_id = ? AND rate_key = ?").run(orgId, key);
      return;
    }
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000) throw new Error("Rates must be a number between 0 and 1,000,000.");
    this.db
      .prepare(
        `INSERT INTO org_rates (org_id, rate_key, value, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(org_id, rate_key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      )
      .run(orgId, key, value, userId, new Date().toISOString());
  }
}
