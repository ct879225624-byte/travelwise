import { runDueMonitorSources } from "../src/modules/radar/service";

async function run() {
  const results = await runDueMonitorSources("radar-runner");
  console.log(JSON.stringify({ ranAt: new Date().toISOString(), results: results.map(({ sourceId, status, message }) => ({ sourceId, status, message })) }));
}

await run();
if (process.argv.includes("--watch")) {
  setInterval(() => void run().catch((error) => console.error("Radar runner failed", error instanceof Error ? error.message : "unknown")), 6 * 60 * 60 * 1000);
}
