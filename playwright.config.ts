import { defineConfig, devices } from "@playwright/test";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= ".cache/ms-playwright";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: { TRAVELWISE_DATA_SOURCE: "demo", NEXT_TELEMETRY_DISABLED: "1", AUTH_SECRET: "phase2-playwright-secret-change-me", ADMIN_EMAIL: "admin@test.travelwise.local", ADMIN_PASSWORD_HASH: "$2b$12$HO0hY7sS/IXNmWKEzGMV7uq5ZZwYPOwWRJj.agQhqP13lgF0jQKzC" },
  },
});
