import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { requireDatabaseUrl } from "@/shared/env";

export function connectDatabase(url: string) {
  const client = postgres(requireDatabaseUrl(url), { max: 5, connect_timeout: 5, idle_timeout: 20, connection: { timezone: "UTC" } });
  return { db: drizzle(client, { schema }), client };
}
export type Database = ReturnType<typeof connectDatabase>["db"];

const globalDb = globalThis as typeof globalThis & { travelwiseConnection?: ReturnType<typeof connectDatabase> };

export function getDatabase(): Database {
  globalDb.travelwiseConnection ??= connectDatabase(requireDatabaseUrl());
  return globalDb.travelwiseConnection.db;
}
