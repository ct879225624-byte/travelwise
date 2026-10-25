import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { guideCategories, programs } from "../src/db/schema";
import { guideCategoryNames } from "../src/db/reference-data";
import { requireDatabaseUrl } from "../src/shared/env";

// Production-safe reference dictionaries only. Never import demo-seed here.
let client: ReturnType<typeof postgres> | undefined;
try {
  client = postgres(requireDatabaseUrl(), { max: 1, connect_timeout: 5 });
  await drizzle(client).transaction(async (tx) => {
    await tx.insert(programs).values({ code: "jinjiang-rewards", name: "锦江荟", kind: "hotel", pointsName: "锦江积分" }).onConflictDoNothing();
    for (const [index, name] of guideCategoryNames.entries()) await tx.insert(guideCategories).values({ slug: `jinjiang-guide-${index + 1}`, name, position: index + 1 }).onConflictDoNothing();
  });
  console.log("Reference dictionaries initialized; no promotions, rules, evidence or private data written.");
} catch {
  console.error("Reference initialization failed: verify database availability, migrations and permissions. Credentials suppressed.");
  process.exitCode = 1;
} finally { if (client) await client.end(); }
