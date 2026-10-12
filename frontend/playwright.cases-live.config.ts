import { defineConfig } from "@playwright/test";

if (!process.env.DECISION_CASES_LIVE_WEB_URL || !process.env.DECISION_CASES_LIVE_API_URL
  || !process.env.DECISION_CASES_LIVE_USERNAME || !process.env.DECISION_CASES_LIVE_PASSWORD) {
  throw new Error("Real-service acceptance requires DECISION_CASES_LIVE_WEB_URL, DECISION_CASES_LIVE_API_URL, DECISION_CASES_LIVE_USERNAME and DECISION_CASES_LIVE_PASSWORD. No fixture server is started.");
}
export default defineConfig({
  testDir: "./tests/live-api",
  timeout: 120_000,
  workers: 1,
  retries: 0,
  outputDir: "test-results/decision-cases-live",
  reporter: [["list"], ["html", { outputFolder: "playwright-report/decision-cases-live", open: "never" }]],
  use: {
    baseURL: process.env.DECISION_CASES_LIVE_WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(process.env.OPERATIONS_BROWSER_EXECUTABLE ? { launchOptions: { executablePath: process.env.OPERATIONS_BROWSER_EXECUTABLE } } : {}),
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
