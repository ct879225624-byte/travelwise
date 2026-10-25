import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { insertDemo } from "@/db/demo-seed";
import { requireTestDatabaseUrl } from "@/shared/env";

export default async function setup() {
  const url = requireTestDatabaseUrl();
  const client = postgres(url, { max: 2, connect_timeout: 5, connection: { timezone: "UTC" } });
  try {
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    await db.transaction((tx) => insertDemo(tx));
  } finally {
    await client.end();
  }
}
