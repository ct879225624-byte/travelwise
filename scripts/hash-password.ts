import { hash } from "bcryptjs";
import { readFileSync } from "node:fs";

const password = process.argv[2] === "--stdin" ? readFileSync(0, "utf8").replace(/\r?\n$/, "") : process.argv[2];
if (!password || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
  console.error("Usage: npm run admin:hash -- --stdin (12+ characters, at most 72 UTF-8 bytes; only the hash is printed)");
  process.exitCode = 1;
} else {
  console.log(await hash(password, 12));
}
