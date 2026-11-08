import { devices } from "@playwright/test";
import mock from "./playwright.config";
import sandbox from "./playwright.sandbox.config";

/**
 * The browser suite on other engines and device presets, with each preset's own user agent.
 *   ENGINE=iphone npm run test:e2e:engines                     (mock PayPal)
 *   ENGINE=iphone SUITE=sandbox npm run test:e2e:engines       (real sandbox, PayPal's own window)
 */
const engines = {
  webkit: devices["Desktop Safari"],
  firefox: devices["Desktop Firefox"],
  iphone: devices["iPhone 15"],
  android: devices["Pixel 7"],
};

const name = (process.env.ENGINE ?? "webkit") as keyof typeof engines;
const onSandbox = process.env.SUITE === "sandbox";
const base = onSandbox ? sandbox : mock;

const config = {
  ...base,
  outputDir: `test-results-${name}${onSandbox ? "-sandbox" : ""}`,
  reporter: "line",
  projects: [{ name, testIgnore: "mic-flow.spec.ts", use: engines[name] }],
};

export default config;
