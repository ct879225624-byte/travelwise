import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";
import { insertDemo } from "../src/db/demo-seed";
import { requireDatabaseUrl } from "../src/shared/env";

let client: ReturnType<typeof postgres> | undefined;
try {
  if (process.env.NODE_ENV === "production") throw new Error("Production DEMO seed forbidden.");
  const url = requireDatabaseUrl();
  const databaseUrl = new URL(url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname)) throw new Error("DEMO seeding is local-only.");
  if (databaseUrl.pathname.endsWith("_test")) throw new Error("DEMO seed cannot target the dedicated test database.");
  client = postgres(url, { max: 1, connect_timeout: 5, connection: { timezone: "UTC" } });
  await drizzle(client, { schema }).transaction(async (tx) => insertDemo(tx));
  console.log("Development DEMO seed complete (idempotent, no private records).");
} catch {
  console.error("DEMO seed failed: only non-production local PostgreSQL is allowed; apply migrations first.");
  process.exitCode = 1;
} finally { if (client) await client.end(); }
