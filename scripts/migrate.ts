import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { requireDatabaseUrl } from "../src/shared/env";

let client: ReturnType<typeof postgres> | undefined;
try {
  client = postgres(requireDatabaseUrl(), { max: 1, connect_timeout: 5, connection: { timezone: "UTC" } });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("PostgreSQL migrations applied.");
} catch {
  // Connection errors may include credentials; keep the console output safe.
  console.error("Migration failed: verify DATABASE_URL, PostgreSQL availability and database permissions. No success claimed.");
  process.exitCode = 1;
} finally { if (client) await client.end(); }
