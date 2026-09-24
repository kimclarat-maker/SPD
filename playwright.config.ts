import { defineConfig } from "@playwright/test";

/**
 * End-to-end checks for the prototype. Uses an installed browser channel
 * (default: Microsoft Edge) so no browser download is needed; set
 * PW_CHANNEL=chrome, or unset and run `npx playwright install chromium`.
 */
const port = Number(process.env.PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    channel: process.env.PW_CHANNEL ?? "msedge",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next start -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
