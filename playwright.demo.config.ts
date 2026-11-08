import { defineConfig, devices } from "@playwright/test";

/**
 * Demo recording (npm run demo:record). Builds the app, starts it, records demo/demo.spec.ts as
 * 1280x800 .webm and copies it to videos/. Mock PayPal unless PAYPAL_MODE=sandbox (or
 * DEMO_PAYPAL_MODE=sandbox); AI is mocked unless DEMO_AI_MODE=live.
 * DEMO_BASE_URL=https://… records against a running app instead (the hosted take with live AI):
 * nothing is built or started, and its own PayPal and AI modes apply.
 * DEMO_CLEAN (on unless DEMO_CLEAN=0) hides the For judges menu and box, so the video shows only
 * what a learner or creator sees.
 */
const PORT = Number(process.env.DEMO_PORT ?? 3420);
const SIZE = { width: 1280, height: 800 };
const BASE_URL = process.env.DEMO_BASE_URL?.replace(/\/$/, "") || `http://localhost:${PORT}`;
const CLEAN = process.env.DEMO_CLEAN !== "0";
const PAYPAL_MODE = process.env.DEMO_PAYPAL_MODE ?? process.env.PAYPAL_MODE ?? "mock";
// Sandbox has no reset route, so start clean here and fill the ledger with the shared seed data.
const SANDBOX_SETUP = PAYPAL_MODE === "sandbox" ? "rm -rf .data-demo && npx tsx scripts/seed.ts --sandbox && " : "";

export default defineConfig({
  testDir: "demo",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/demo",
  use: {
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: CLEAN ? [{ origin: new URL(BASE_URL).origin, localStorage: [{ name: "por_clean", value: "1" }] }] : [] },
    viewport: SIZE,
    deviceScaleFactor: 1,
    video: { mode: "on", size: SIZE },
    launchOptions: { slowMo: 80 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: SIZE, deviceScaleFactor: 1 } }],
  webServer: process.env.DEMO_BASE_URL ? undefined : {
    // Production build: no dev reloads or overlays in the recording.
    command: `${SANDBOX_SETUP}npx next build && npx next start --port ${PORT}`,
    url: `http://localhost:${PORT}/api/kit/status`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      PAYPAL_MODE,
      AI_MODE: process.env.DEMO_AI_MODE ?? "mock",
      KIT_DATA_DIR: ".data-demo",
      MOCK_PAYPAL_LATENCY_MS: "250-600",
      DEMO_TEST_CARD: "1",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
