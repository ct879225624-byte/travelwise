import { spawn } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import setup from "../tests/e2e/db-setup";

// Playwright starts webServer before globalSetup. Prepare the fresh test DB
// before Next's readiness probe; never initialize the application database.
await setup();
const production = process.env.TRAVELWISE_E2E_PRODUCTION === "1";
if (production) {
  await mkdir(".next/standalone/.next", { recursive: true });
  await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
  if (existsSync("public")) await cp("public", ".next/standalone/public", { recursive: true });
}
const args = production ? [".next/standalone/server.js"] : ["scripts/next.mjs", "dev", "--hostname", "127.0.0.1", "--port", "3100"];
const child = spawn(process.execPath, args, {
  stdio: "inherit", windowsHide: true,
  env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, ...(production ? { HOSTNAME: "127.0.0.1", PORT: "3100" } : {}) },
});
child.on("error", () => { console.error("Unable to launch isolated PostgreSQL E2E server."); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
