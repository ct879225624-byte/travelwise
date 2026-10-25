import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import postgres from "postgres";
import { requireTestDatabaseUrl } from "@/shared/env";

it("PERSONAL-18 upgrades populated Phase 1 tables without losing balances or repeated participation", async () => {
  const client = postgres(requireTestDatabaseUrl(), { max: 1, onnotice: () => {} });
  const namespace = `phase5_upgrade_${randomUUID().replaceAll("-", "")}`;
  const rollback = Symbol("isolated-upgrade-complete");
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: Array<{ tag: string }> };
  try {
    await client.begin(async (tx) => {
      // A temporary schema inside the dedicated test DB; rollback removes it.
      // Rewrite explicit public FKs so no application tables are touched.
      await tx.unsafe(`CREATE SCHEMA "${namespace}"`);
      await tx.unsafe(`SET LOCAL search_path TO "${namespace}", public`);
      for (const [index, entry] of journal.entries.entries()) {
        const migration = (await readFile(`drizzle/${entry.tag}.sql`, "utf8")).replaceAll('"public".', `"${namespace}".`);
        for (const statement of migration.split("--> statement-breakpoint").filter((s) => s.trim())) await tx.unsafe(statement);
        if (index === 1) {
          await tx`INSERT INTO programs (id, code, name, kind, points_name) VALUES ('10000000-0000-4000-8000-000000000001', 'legacy', 'Legacy', 'hotel', '积分')`;
          await tx`INSERT INTO owners (id) VALUES ('20000000-0000-4000-8000-000000000001')`;
          await tx`INSERT INTO wallets (id, owner_id, program_id) VALUES ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')`;
          await tx`INSERT INTO promotions (id, program_id, slug, title, summary, category, time_zone) VALUES ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'legacy-promo', 'Legacy', 'Legacy', 'hotel', 'UTC')`;
          await tx`INSERT INTO point_batches (wallet_id, owner_id, source, earned_points, remaining_points, earned_at, expires_at) VALUES ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Legacy balance', 10, 8, '2026-01-01Z', '2027-01-01Z')`;
          for (let i = 0; i < 2; i++) await tx`INSERT INTO actions (owner_id, promotion_id, wallet_id, program_id) VALUES ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')`;
        }
      }
      const batches = await tx`SELECT earned_points, remaining_points, expiry_status, program_id, credited_at FROM point_batches`;
      expect(batches).toHaveLength(1); expect(BigInt(batches[0].earned_points)).toBe(10n); expect(BigInt(batches[0].remaining_points)).toBe(8n); expect(batches[0].expiry_status).toBe("known"); expect(batches[0].program_id).not.toBeNull(); expect(new Date(batches[0].credited_at).toISOString()).toBe("2026-01-01T00:00:00.000Z");
      const ledger = await tx`SELECT sum(points)::text AS points FROM point_transactions`; expect(ledger[0].points).toBe("8");
      const participations = await tx`SELECT cycle_key FROM actions`; expect(participations).toHaveLength(2); expect(new Set(participations.map((a) => a.cycle_key)).size).toBe(2);
      throw rollback;
    }).catch((error) => { if (error !== rollback) throw error; });
  } finally { await client.end(); }
}, 15000);
