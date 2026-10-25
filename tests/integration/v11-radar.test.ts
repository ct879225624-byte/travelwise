import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";
import { requireTestDatabaseUrl } from "@/shared/env";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  describe("V1.1 PostgreSQL radar contract", () => { it("BLOCKED: TEST_DATABASE_URL is required", () => { throw new Error("BLOCKED: TEST_DATABASE_URL is required"); }); });
} else {
  describe("V1.1 PostgreSQL radar contract", () => {
    let client: Sql;
    beforeAll(async () => { client = postgres(requireTestDatabaseUrl(), { max: 1, connect_timeout: 5, connection: { timezone: "UTC" } }); });
    afterAll(async () => { if (client) { await client`TRUNCATE TABLE ai_extraction_tasks, radar_events, monitor_runs, monitor_versions, monitor_sources RESTART IDENTITY CASCADE`; await client.end(); } });
    it("creates isolated private radar and AI tables with safety checks", async () => {
      const tables = await client`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('monitor_sources','monitor_versions','monitor_runs','radar_events','ai_extraction_tasks') ORDER BY table_name`;
      expect(tables.map((row) => row.table_name)).toEqual(["ai_extraction_tasks", "monitor_runs", "monitor_sources", "monitor_versions", "radar_events"]);
      const checks = await client`SELECT constraint_name FROM information_schema.check_constraints WHERE constraint_name IN ('monitor_frequency_range','monitor_url_scheme','ai_source_required') ORDER BY constraint_name`;
      expect(checks.map((row) => row.constraint_name)).toEqual(["ai_source_required", "monitor_frequency_range", "monitor_url_scheme"]);
    });
    it("enforces source URL uniqueness and version fingerprint idempotency", async () => {
      const source = await client`INSERT INTO monitor_sources (name,url,source_type) VALUES ('测试公开来源','https://example.com/travelwise-test','web') RETURNING id`;
      const sourceId = source[0].id;
      await client`INSERT INTO monitor_versions (source_id,version,fingerprint,normalized_content,http_status,fetched_at) VALUES (${sourceId},1,'fingerprint-a','奖励 1000 积分',200,now())`;
      await expect(client`INSERT INTO monitor_sources (name,url,source_type) VALUES ('重复','https://example.com/travelwise-test','web')`).rejects.toMatchObject({ code: "23505" });
      await expect(client`INSERT INTO monitor_versions (source_id,version,fingerprint,normalized_content,http_status,fetched_at) VALUES (${sourceId},2,'fingerprint-a','奖励 1000 积分',200,now())`).rejects.toMatchObject({ code: "23505" });
      await client`INSERT INTO monitor_versions (source_id,version,fingerprint,normalized_content,http_status,fetched_at) VALUES (${sourceId},2,'fingerprint-b','奖励 2000 积分',200,now())`;
      const rows = await client`SELECT count(*)::int AS count FROM monitor_versions WHERE source_id = ${sourceId}`;
      expect(Number(rows[0].count)).toBe(2);
    });
  });
}
