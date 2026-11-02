import type { NextConfig } from "next";
import { loadEnvFiles, readKitEnv } from "./src/lib/env-core";

// Load .env.local, then ../../.env.shared (apps/<slug>) or ../.env.shared (the kit), and
// refuse to start (dev, build or start) unless PAYPAL_MODE is "mock" or "sandbox".
loadEnvFiles();
const env = readKitEnv();
if (process.env.NEXT_PHASE !== "phase-production-build" || process.env.KIT_LOG_ENV) {
  console.log(`[kit] PayPal: ${env.paypalMode} · AI: ${env.aiMode} · daily AI cap $${env.aiDailyCapUsd}`);
}

// AG Studio is on a trial licence, so a build without the switch must not contain it. A plain
// conditional around the dynamic import leaves the library in .next/static. This alias keeps it
// out of the module graph, and `npm run check:sponsor-free` proves it.
const sponsorUi = process.env.NEXT_PUBLIC_SPONSOR_UI === "1";

const nextConfig: NextConfig = {
  // Lets e2e/demo runs use their own build dir next to a running `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // A separate build dir gets its own tsconfig so Next never rewrites the main one.
  typescript: { tsconfigPath: process.env.NEXT_DIST_DIR ? "tsconfig.e2e.json" : "tsconfig.json" },
  cacheComponents: true,
  partialPrefetching: true,
  // CommonJS + Node-only deps (axios, paypal-server-sdk, an npm package named "os").
  serverExternalPackages: ["@paypal/agent-toolkit", "@paypal/paypal-server-sdk"],
  poweredByHeader: false,
  // No floating dev badge: it would show up in demo recordings.
  devIndicators: false,
  turbopack: {
    resolveAlias: sponsorUi ? {} : { "@/components/course/cohort-studio": "./src/components/course/cohort-studio-off.tsx" },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
