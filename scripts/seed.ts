/**
 * npm run seed — load demo data into the current PAYPAL_MODE. Safe to run while `npm run dev`
 * is up: the server picks up the new state on its next request.
 * npm run seed:sandbox — on the real sandbox, seeds only this app's own records (the sample
 * cohort). The kit's shared shop orders (src/lib/demo/sandbox-seed.ts) stay out: they aren't
 * this course's, and judges read the ledger and timeline as the course's own.
 */
import { loadEnvFiles } from "../src/lib/env-core";
import { getEnv } from "../src/lib/env";
import { getMockPayPal } from "../src/lib/paypal";
import { seedDemoData } from "../src/lib/demo/seed";
import { seedAppData } from "../src/lib/demo/app-data";

async function main() {
  loadEnvFiles();
  const env = getEnv();
  if (env.paypalMode === "sandbox" || process.argv.includes("--sandbox")) {
    await seedAppData();
    console.log("Seeded the sample cohort. No PayPal objects created.");
    process.exit(0);
  }
  const reset = process.argv.includes("--reset");
  const mock = getMockPayPal();
  if (reset && mock) mock.reset();
  console.log(`Seeding demo data (PayPal ${env.paypalMode})…`);
  const result = await seedDemoData();
  if (mock) await mock.flushWebhooks();
  console.log("Created:", result.created);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
