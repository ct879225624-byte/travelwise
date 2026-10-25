import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Keep the database run independent from the unit suite. This makes a blocked
// or failed PostgreSQL check visible instead of reporting unrelated unit tests.
export default defineConfig({
  resolve: { alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
  } },
  test: { environment: "node", include: ["tests/integration/**/*.test.ts"], testTimeout: 15000, hookTimeout: 15000, fileParallelism: false },
});
