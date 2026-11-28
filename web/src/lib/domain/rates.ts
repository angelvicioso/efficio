/**
 * Rates used to estimate money at risk (S-060, D-040). Each has an Efficio default with its
 * source; each company can override them (its own carrier contract, its own penalties).
 */
export type RateKey =
  | "exportStorage"
  | "exportStorage53"
  | "rehandle"
  | "reeferPowerPerDay"
  | "examMove"
  | "weighContainer"
  | "detentionFreeDays"
  | "detentionDay4to6"
  | "detentionDay7plus"
  | "nextSailingDays"
  | "missedSailingCost";

export interface RateInfo {
  label: string;
  unit: string;
  value: number;
  source: string;
  /** "port": from Port Houston's tariff; "carrier": carrier default, replace with your contract; "yours": your own estimate. */
  kind: "port" | "carrier" | "yours";
}

export const DEFAULT_RATES: Record<RateKey, RateInfo> = {
  exportStorage: { label: "Export storage (rolled, stored over 7 days)", unit: "per container, per 7 days", value: 211.28, source: "Port Houston Tariff 14 (Sep 1, 2026), Subrule 093", kind: "port" },
  exportStorage53: { label: "Export storage, 53' containers", unit: "per container, per 7 days", value: 279.95, source: "Port Houston Tariff 14 (Sep 1, 2026), Subrule 093", kind: "port" },
  rehandle: { label: "Rehandling when rolled", unit: "per container", value: 81.61, source: "Port Houston Tariff 14, Subrule 090 A2", kind: "port" },
  reeferPowerPerDay: { label: "Reefer power at the terminal", unit: "per container, per day", value: 41.12, source: "Port Houston Tariff 14, Subrule 090 A1", kind: "port" },
  examMove: { label: "Customs exam move (dray to and from exam)", unit: "per container", value: 139.61, source: "Port Houston Tariff 14, Subrule 090 B1", kind: "port" },
  weighContainer: { label: "Weighing a container at the terminal (no VGM)", unit: "per container", value: 127.39, source: "Port Houston Tariff 14, Subrule 090 B3", kind: "port" },
  detentionFreeDays: { label: "Carrier detention free days (empty out to full in)", unit: "days", value: 3, source: "Default from Maersk's US export detention tariff (Jan 2026). Replace with your contract", kind: "carrier" },
  detentionDay4to6: { label: "Carrier detention, first 3 days past free time", unit: "per container, per day", value: 360, source: "Default from Maersk's US export detention tariff (Jan 2026). Replace with your contract", kind: "carrier" },
  detentionDay7plus: { label: "Carrier detention, after that", unit: "per container, per day", value: 465, source: "Default from Maersk's US export detention tariff (Jan 2026). Replace with your contract", kind: "carrier" },
  nextSailingDays: { label: "Days until the next sailing if this one is missed", unit: "days", value: 7, source: "Efficio default: most services call weekly", kind: "yours" },
  missedSailingCost: { label: "Your own cost of a missed sailing (penalties, lost sales)", unit: "per booking", value: 0, source: "Not set: add your own estimate", kind: "yours" },
};

export const RATE_KEYS = Object.keys(DEFAULT_RATES) as RateKey[];
export type Rates = Record<RateKey, number>;

export function defaultRates(): Rates {
  return Object.fromEntries(RATE_KEYS.map((k) => [k, DEFAULT_RATES[k].value])) as Rates;
}

export function money(n: number): string {
  const cents = n < 1000 && !Number.isInteger(n) ? 2 : 0;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents, maximumFractionDigits: cents });
}
