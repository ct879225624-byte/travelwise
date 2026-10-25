import { z } from "zod";

const databaseUrl = z.url().refine((value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol));

export function readEnvironment(input: NodeJS.ProcessEnv = process.env) {
  const production = input.NODE_ENV === "production";
  const source = z.enum(["demo", "postgres"]).safeParse(input.TRAVELWISE_DATA_SOURCE ?? (production ? "postgres" : "demo"));
  if (!source.success) throw new Error("TRAVELWISE_DATA_SOURCE must be demo or postgres.");
  if (production && source.data === "demo") throw new Error("DEMO data is disabled in production.");
  return { source: source.data };
}

export function requireDatabaseUrl(value = process.env.DATABASE_URL): string {
  const result = databaseUrl.safeParse(value);
  // Do not put Zod errors or raw URL values into logs: URLs contain credentials.
  if (!result.success) throw new Error("A valid PostgreSQL DATABASE_URL is required.");
  return result.data;
}

export function requireTestDatabaseUrl(input: NodeJS.ProcessEnv = process.env): string {
  if (!input.TEST_DATABASE_URL) throw new Error("BLOCKED: TEST_DATABASE_URL is missing; install/start PostgreSQL and configure the dedicated test database.");
  const value = requireDatabaseUrl(input.TEST_DATABASE_URL);
  if (!new URL(value).pathname.endsWith("_test")) throw new Error("Integration tests require a database name ending in _test.");
  if (input.DATABASE_URL && new URL(input.DATABASE_URL).pathname === new URL(value).pathname) {
    throw new Error("Test and application database names must differ.");
  }
  return value;
}
