import { defineConfig } from "drizzle-kit";

// Generate/check need no connection. Applying migrations uses scripts/migrate.ts.
export default defineConfig({ dialect: "postgresql", schema: "./src/db/schema.ts", out: "./drizzle", strict: true });
