import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for PostgreSQL browser checks.");

// Spreading the base config replaces its DEMO web server. Passing two configs
// to defineConfig would merge both web servers and make them race for 3100.
export default defineConfig({ ...base,
  webServer: {
    command: "node --env-file-if-exists=.env --import tsx scripts/start-db-e2e.ts",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: { TRAVELWISE_DATA_SOURCE: "postgres", NEXT_TELEMETRY_DISABLED: "1", AUTH_SECRET: "phase2-playwright-secret-change-me", ADMIN_EMAIL: "admin@test.travelwise.local", ADMIN_PASSWORD_HASH: "$2b$12$HO0hY7sS/IXNmWKEzGMV7uq5ZZwYPOwWRJj.agQhqP13lgF0jQKzC" },
  },
});
