import { describe, expect, it } from "vitest";
import { readEnvironment, requireDatabaseUrl, requireTestDatabaseUrl } from "@/shared/env";

describe("environment boundaries", () => {
  it("defaults development to demo and forbids demo in production", () => {
    expect(readEnvironment({ NODE_ENV: "development" }).source).toBe("demo");
    expect(() => readEnvironment({ NODE_ENV: "production", TRAVELWISE_DATA_SOURCE: "demo" })).toThrow();
  });

  it("validates database URLs without echoing credentials", () => {
    expect(requireDatabaseUrl("postgres://user:password@localhost:5432/travelwise")).toContain("postgres://");
    expect(() => requireDatabaseUrl("not-a-database-url")).toThrow();
    expect(() => requireTestDatabaseUrl({ NODE_ENV: "test", TEST_DATABASE_URL: "postgres://u:p@localhost:5432/travelwise" })).toThrow(/ending in _test/);
  });
});
