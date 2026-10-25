import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url)), "install", "chromium"], {
  stdio: "inherit", env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: fileURLToPath(new URL("../.cache/ms-playwright", import.meta.url)) },
});
child.on("error", () => { console.error("Unable to install the test browser."); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
