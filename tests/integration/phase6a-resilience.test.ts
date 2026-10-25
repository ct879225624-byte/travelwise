import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import postgres, { type Sql } from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Database } from "@/db/client";
import * as schema from "@/db/schema";
import { requireTestDatabaseUrl } from "@/shared/env";

// Identity is isolated; database queries and a refused network connection are real.
const context = vi.hoisted(() => ({ db: undefined as Database | undefined, ownerId: "" }));
vi.mock("@/db/client", () => ({ getDatabase: () => context.db }));
vi.mock("@/modules/personal/auth", () => ({ requireOwner: async () => ({ id: context.ownerId, email: "phase6a@test.travelwise.local" }) }));
import { addPoints } from "@/modules/personal/service";
import { guideInputSchema, saveEvidence, savePromotion, saveRule, setRuleVersionStatus } from "@/modules/admin/service";

let client: Sql;
let unavailable: Sql;
beforeAll(async () => {
  const url = requireTestDatabaseUrl();
  client = postgres(url, { max: 2, connect_timeout: 2, onnotice: () => {} });
  context.db = drizzle(client, { schema });
  await migrate(context.db, { migrationsFolder: "./drizzle" });
  // A closed loopback port causes ECONNREFUSED without interrupting any server.
  const refused = new URL(url); refused.port = "1";
  unavailable = postgres(refused.href, { max: 1, connect_timeout: 1 });
});
afterAll(async () => {
  context.db = undefined;
  if (unavailable) await unavailable.end({ timeout: 1 });
  if (client) {
    await client`TRUNCATE TABLE programs, owners, audit_logs RESTART IDENTITY CASCADE`;
    await client.end();
  }
});

it("FLOW-D retries the same credit after a real refused DB connection without phantom or duplicate assets", async () => {
  const owner = randomUUID(); const code = `phase6a-${randomUUID()}`;
  await client`INSERT INTO owners (id) VALUES (${owner})`;
  await client`INSERT INTO programs (code, name, kind, points_name) VALUES (${code}, 'Phase 6A TEST ONLY', 'hotel', '积分')`;
  context.ownerId = owner;
  const input = { programCode: code, source: "Phase 6A TEST opening", sourceType: "initial_balance" as const, points: "100", expiryStatus: "unknown" as const, idempotencyKey: randomUUID() };
  context.db = drizzle(unavailable, { schema });
  await expect(addPoints(input)).rejects.toThrow();
  expect((await client`SELECT count(*)::int AS n FROM point_batches WHERE owner_id = ${owner}`)[0].n).toBe(0);
  context.db = drizzle(client, { schema });
  await addPoints(input); await addPoints(input);
  const batches = await client`SELECT remaining_points FROM point_batches WHERE owner_id = ${owner}`;
  expect(batches).toHaveLength(1); expect(BigInt(batches[0].remaining_points)).toBe(100n);
  const ledger = await client`SELECT count(*)::int AS n, sum(points)::text AS balance FROM point_transactions WHERE owner_id = ${owner}`;
  expect(ledger[0].n).toBe(1); expect(ledger[0].balance).toBe("100");
});

it("FLOW-A reuses the exact source URL for two rule observations without moving or overwriting old evidence", async () => {
  context.db = drizzle(client, { schema });
  const rule = { code: `phase6a-rule-${randomUUID()}`, name: "Phase 6A TEST rule", type: "test", terms: ["TEST version 1"], applicability: ["Isolation only"], validFrom: new Date("2026-01-01T00:00:00Z"), timeZone: "UTC" };
  const v1 = await saveRule(rule, "phase6a-test");
  const observation = { sourceLabel: "TEST observation", sourceUrl: "https://example.test/phase6a-same-source", sourceKind: "other" as const, excerpt: "TEST captured terms", verificationStatus: "unverified" as const, actor: "phase6a-test" };
  const first = await saveEvidence({ ...observation, ruleVersionId: v1.versionId });
  await setRuleVersionStatus(v1.versionId, "phase6a-test");
  const old = (await client`SELECT to_jsonb(e) AS value FROM evidence e WHERE id = ${first}`)[0].value;
  const v2 = await saveRule({ ...rule, ruleId: v1.ruleId, terms: ["TEST version 2"] }, "phase6a-test");
  const second = await saveEvidence({ ...observation, ruleVersionId: v2.versionId });
  await setRuleVersionStatus(v2.versionId, "phase6a-test");
  expect(second).not.toBe(first);
  expect((await client`SELECT to_jsonb(e) AS value FROM evidence e WHERE id = ${first}`)[0].value).toEqual(old);
  expect((await client`SELECT count(*)::int AS n FROM evidence WHERE source_url = ${observation.sourceUrl}`)[0].n).toBe(2);
  const versions = await client`SELECT version, publication_status FROM rule_versions WHERE rule_id = ${v1.ruleId} ORDER BY version`;
  expect(versions.map((row) => [row.version, row.publication_status])).toEqual([[1, "published"], [2, "published"]]);
  const promotion = { slug: `phase6a-linked-${randomUUID()}`, title: "TEST linked rule", summary: "Isolation only", category: "test" };
  const id = await savePromotion({ ...promotion, ruleVersionId: v1.versionId }, null, "phase6a-test");
  await savePromotion({ ...promotion, summary: "TEST edited without changing rule" }, id, "phase6a-test");
  expect((await client`SELECT rule_version_id FROM promotions WHERE id = ${id}`)[0].rule_version_id).toBe(v1.versionId);
});

it("production reference initialization is idempotent and leaves content and private records unchanged", async () => {
  const privateBefore = await client`SELECT to_jsonb(b) AS value FROM point_batches b ORDER BY id`;
  const contentBefore = await client`SELECT count(*)::int AS n FROM promotions`;
  const initialize = () => execFileSync(process.execPath, ["--import", "tsx", "scripts/init-reference-data.ts"], { env: { ...process.env, NODE_ENV: "production", DATABASE_URL: requireTestDatabaseUrl() }, windowsHide: true, stdio: "pipe" });
  initialize();
  const first = await client`SELECT to_jsonb(c) AS value FROM guide_categories c ORDER BY id`;
  initialize();
  expect(first).toHaveLength(12);
  expect(await client`SELECT to_jsonb(c) AS value FROM guide_categories c ORDER BY id`).toEqual(first);
  expect(await client`SELECT count(*)::int AS n FROM promotions`).toEqual(contentBefore);
  expect(await client`SELECT to_jsonb(b) AS value FROM point_batches b ORDER BY id`).toEqual(privateBefore);
});

it("rejects content that would fail the public DTO before persisting any record", async () => {
  context.db = drizzle(client, { schema });
  const before = await client`SELECT (SELECT count(*) FROM promotions)::int AS promotions, (SELECT count(*) FROM rule_versions)::int AS rules, (SELECT count(*) FROM evidence)::int AS evidence`;
  const rule = { code: `phase6a-invalid-${randomUUID()}`, name: "TEST invalid rule", type: "test", terms: ["  "], validFrom: new Date(), timeZone: "UTC" };
  for (const terms of [[], [""], ["  "]]) await expect(saveRule({ ...rule, terms }, "phase6a-test")).rejects.toThrow();
  const promotion = { slug: "x".repeat(121), title: "TEST invalid content", summary: "TEST", category: "test" };
  await expect(savePromotion(promotion, null, "phase6a-test")).rejects.toThrow();
  await expect(savePromotion({ ...promotion, slug: "phase6a-invalid-zone", timeZone: "Not/AZone" }, null, "phase6a-test")).rejects.toThrow();
  for (const startsAt of ["+010000-01-01T00:00:00Z", "-000001-01-01T00:00:00Z", "2026-01-01T00:00"]) await expect(savePromotion({ ...promotion, slug: "phase6a-invalid-time", startsAt }, null, "phase6a-test")).rejects.toThrow();
  await expect(saveRule({ ...rule, terms: ["TEST"], validFrom: new Date("+010000-01-01T00:00:00Z") }, "phase6a-test")).rejects.toThrow();
  expect(guideInputSchema.safeParse({ slug: "x".repeat(121), title: "TEST", summary: "TEST", body: "TEST", categoryId: randomUUID() }).success).toBe(false);
  const source = { sourceLabel: "TEST", sourceUrl: "https://example.test/test", sourceKind: "other" as const, excerpt: "TEST", verificationStatus: "unverified" as const, actor: "phase6a-test" };
  for (const invalid of [{ sourceLabel: " " }, { excerpt: " " }, { sourceUrl: "https://" }, { sourceUrl: "javascript:alert(1)" }]) await expect(saveEvidence({ ...source, ...invalid })).rejects.toThrow();
  expect(await client`SELECT (SELECT count(*) FROM promotions)::int AS promotions, (SELECT count(*) FROM rule_versions)::int AS rules, (SELECT count(*) FROM evidence)::int AS evidence`).toEqual(before);
});
