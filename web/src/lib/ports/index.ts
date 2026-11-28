import type { PortAdapter } from "./adapter";
import { MockPortHoustonAdapter } from "./mock";
import { NavisPortHoustonAdapter } from "./navis/adapter";

let adapter: PortAdapter | null = null;

const LIVE = new Set(["navis", "navis-evp", "live", "n4"]);
const SIMULATED = new Set(["mock", "simulated", "demo"]);

export interface DataSourceSetting {
  /** Exactly what PORT_ADAPTER contains (null if unset), so typos and spaces are visible. */
  raw: string | null;
  kind: "live" | "simulated";
  /** False when PORT_ADAPTER is set to something we don't understand (we fall back to simulated). */
  recognized: boolean;
}

/** Reads PORT_ADAPTER forgivingly: case and surrounding spaces don't matter (D-039). */
export function dataSourceSetting(env: NodeJS.ProcessEnv = process.env): DataSourceSetting {
  const raw = env.PORT_ADAPTER ?? null;
  const v = (raw ?? "").trim().toLowerCase();
  if (LIVE.has(v)) return { raw, kind: "live", recognized: true };
  return { raw, kind: "simulated", recognized: v === "" || SIMULATED.has(v) };
}

/** Picks the adapter from PORT_ADAPTER: "navis" for live Port Houston data, otherwise simulated. */
export function getPortAdapter(): PortAdapter {
  if (adapter) return adapter;
  const setting = dataSourceSetting();
  if (!setting.recognized) console.warn(`[data] PORT_ADAPTER=${JSON.stringify(setting.raw)} isn't recognized; using simulated data. Use "navis" for live.`);
  adapter = setting.kind === "live" ? new NavisPortHoustonAdapter() : new MockPortHoustonAdapter();
  return adapter;
}
