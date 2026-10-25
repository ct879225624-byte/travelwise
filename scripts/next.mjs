import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Keep Next telemetry from creating configuration outside this workspace.
const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)), ...process.argv.slice(2)], {
  stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
child.on("error", () => { console.error("Unable to launch Next.js."); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
