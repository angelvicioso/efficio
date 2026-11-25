/**
 * First real call to Port Houston's Navis N4 API (spike S-013), from the command line.
 *
 *   npm run port-houston:check
 *
 * Reads credentials from web/.env.local or the environment. Same check as the super admin
 * "Test Port Houston connection" button: field names and masked formats only, no real data.
 */
import { runPortHoustonCheck } from "../src/lib/ports/navis/check";

export { describe, mask } from "../src/lib/ports/navis/check";

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local: use the environment as-is.
  }
  console.log((await runPortHoustonCheck()).join("\n"));
}

if (process.argv[1]?.endsWith("port-houston-check.ts")) void main();
