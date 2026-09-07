import { defineConfig, devices } from "playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "loader-browser.spec.mjs",
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: { command: "npm run start -- --port 3100", url: "http://127.0.0.1:3100/loader-verification", timeout: 60000 },
});
