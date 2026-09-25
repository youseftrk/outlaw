import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";

/**
 * E2E: builds + starts the production server on an isolated port with a fresh,
 * throwaway data dir so runs are deterministic and never touch `.data/`.
 * `PLAYWRIGHT_BASE_URL` reuses an already-running server instead.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3411);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const dataDir = join(__dirname, ".e2e-data");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run start -- --port ${PORT}`,
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 240_000,
        stdout: "ignore",
        stderr: "pipe",
        env: {
          QALAA_RESET: "1",
          QALAA_DATA_DIR: dataDir,
          NEXT_TELEMETRY_DISABLED: "1",
        },
      },
});
