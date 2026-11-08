import { defineConfig, devices } from "@playwright/test";
import { testRunState } from "./tests/e2e/test-run";

/**
 * End-to-end tests (npm run test:e2e). Builds and starts the app in PayPal MOCK mode with its own
 * data dir. AI is mocked unless E2E_AI_MODE=live (then real Claude, tiny spend).
 * Uses a production build: `next dev` can reload endlessly. NEXT_PUBLIC_SPONSOR_UI is read at build
 * time, so set it on the command to test the sponsor UI.
 */
const PORT = Number(process.env.E2E_PORT ?? 3120);

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "*.spec.ts",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/mock",
  use: {
    baseURL: `http://localhost:${PORT}`,
    storageState: testRunState(`http://localhost:${PORT}`),
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: `rm -rf .data-e2e .next-e2e && npx next build && npx next start --port ${PORT}`,
    url: `http://localhost:${PORT}/api/kit/status`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      PAYPAL_MODE: process.env.E2E_PAYPAL_MODE ?? "mock",
      AI_MODE: process.env.E2E_AI_MODE ?? "mock",
      KIT_DATA_DIR: ".data-e2e",
      // Some 45 purchases and refunds a run: more than the $2,000 a day the app allows its agents.
      AGENT_MAX_PER_DAY: "20000.00",
      AI_RATE_LIMIT_PER_MINUTE: "120",
      API_RATE_LIMIT_PER_MINUTE: "1000",
      MOCK_PAYPAL_LATENCY_MS: "60-160",
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_SPONSOR_UI: process.env.NEXT_PUBLIC_SPONSOR_UI ?? "",
    },
  },
});
