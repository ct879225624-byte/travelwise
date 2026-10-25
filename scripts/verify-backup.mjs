import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import postgres from "postgres";

// Acceptance-only: restore into a fresh local test DB, never overwrite a DB.
const connections = [];
function guard(value, restore = false) {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !url.pathname.endsWith(restore ? "_restore_test" : "_test")) throw new Error("Unsafe acceptance database");
  return url;
}
function connect(url) {
  const client = postgres(url.href, { max: 1, connect_timeout: 5, connection: { timezone: "UTC" }, onnotice: () => {} });
  connections.push(client); return client;
}
function pg(tool, args, url) {
  const bin = process.env.PG_BIN ? `${process.env.PG_BIN}/${tool}` : tool;
  return execFileSync(bin, args, { windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)) } });
}
async function snapshot(client) {
  const tables = await client`SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public', 'drizzle') ORDER BY schemaname, tablename`;
  const result = {};
  for (const { schemaname, tablename } of tables) {
    const rows = await client`SELECT count(*)::int AS count, md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' ORDER BY to_jsonb(t)::text), '')) AS digest FROM ${client(`${schemaname}.${tablename}`)} t`;
    result[`${schemaname}.${tablename}`] = rows[0];
  }
  return result;
}
async function run() {
  if (process.env.NODE_ENV === "production") throw new Error("Production restore forbidden");
  const source = guard(process.env.BACKUP_SOURCE_DATABASE_URL);
  const destination = guard(process.env.RESTORE_TEST_DATABASE_URL, true);
  if (source.host === destination.host && source.pathname === destination.pathname) throw new Error("Databases must differ");
  const archive = process.env.BACKUP_FILE;
  if (!archive || !isAbsolute(archive) || existsSync(archive)) throw new Error("A new absolute backup path is required");
  const original = connect(source); const restored = connect(destination);
  if ((await restored`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`)[0].n !== 0) throw new Error("Restore database must be empty");
  const before = await snapshot(original);
  for (const table of ["point_batches", "point_transactions", "saved_scenarios", "reward_records", "actions", "audit_logs"]) if (!(before[`public.${table}`]?.count > 0)) throw new Error("Representative private fixture is missing");
  if (!(before["public.rule_versions"]?.count > 1)) throw new Error("Rule history is missing");
  const started = Date.now();
  pg("pg_dump", ["--format=custom", "--no-acl", "--file", archive], source);
  pg("pg_restore", ["--no-owner", "--no-acl", "--exit-on-error", "--single-transaction", "--dbname", destination.pathname.slice(1), archive], destination);
  const after = await snapshot(restored);
  if (!isDeepStrictEqual(before, after) || !isDeepStrictEqual(before, await snapshot(original))) throw new Error("Data changed or restore differs");
  const mismatches = await restored`SELECT w.id FROM wallets w LEFT JOIN (SELECT wallet_id, sum(remaining_points) AS balance FROM point_batches GROUP BY wallet_id) b ON b.wallet_id = w.id LEFT JOIN (SELECT wallet_id, sum(points) AS balance FROM point_transactions GROUP BY wallet_id) t ON t.wallet_id = w.id WHERE coalesce(b.balance, 0) <> coalesce(t.balance, 0)`;
  if (mismatches.length) throw new Error("Restored point ledger differs");
  const missingRules = await restored`SELECT count(*)::int AS n FROM saved_scenarios s CROSS JOIN LATERAL jsonb_array_elements_text(s.rule_version_ids) ref(id) LEFT JOIN rule_versions r ON r.id::text = ref.id WHERE r.id IS NULL`;
  if (missingRules[0].n !== 0) throw new Error("Historical rule reference is missing");
  const badAllocations = await restored`SELECT count(*)::int AS n FROM point_transactions t WHERE points <> coalesce((SELECT sum((a->>'delta')::numeric) FROM jsonb_array_elements(t.allocations) a), 0)`;
  if (badAllocations[0].n !== 0) throw new Error("Transaction allocations differ");
  if ((await restored`SELECT count(*)::int AS n FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND NOT convalidated`)[0].n !== 0) throw new Error("Unvalidated constraints");
  const version = (await restored`SHOW server_version`)[0].server_version;
  const evidence = { executedAt: new Date().toISOString(), timezone: "Asia/Hong_Kong", serverVersion: version, pgDumpVersion: pg("pg_dump", ["--version"], source).trim(), sourceDatabase: source.pathname.slice(1), restoredDatabase: destination.pathname.slice(1), archive, archiveSha256: createHash("sha256").update(readFileSync(archive)).digest("hex"), elapsedMs: Date.now() - started, tableCount: Object.keys(before).length, tables: after, dataFingerprintsEqual: true, pointLedgerBalanced: true, transactionAllocationsBalanced: true, historyReferencesValid: true, constraintsValidated: true, applicationReadVerified: false };
  writeFileSync("docs/operations/phase6a-restore-evidence.json", `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`Backup/restore PASS: ${evidence.tableCount} tables, identical row fingerprints, balanced ledger, valid constraints. App read still requires browser verification.`);
}
try { await run(); } catch {
  console.error("Backup/restore verification FAILED: check isolated database guards, empty target, fixtures, PG tools, archive path and local access. No success claimed; credentials suppressed.");
  process.exitCode = 1;
} finally { await Promise.all(connections.map((client) => client.end())); }
