import type { PortAdapter } from "./adapter";
import { MockPortHoustonAdapter } from "./mock";
import { NavisPortHoustonAdapter } from "./navis/adapter";

let adapter: PortAdapter | null = null;

/** Picks the adapter from PORT_ADAPTER ("mock" by default, or "navis"). */
export function getPortAdapter(): PortAdapter {
  if (adapter) return adapter;
  const kind = (process.env.PORT_ADAPTER ?? "mock").toLowerCase();
  adapter = kind === "navis" ? new NavisPortHoustonAdapter() : new MockPortHoustonAdapter();
  return adapter;
}
