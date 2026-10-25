import "server-only";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { owners } from "@/db/schema";
import { getAdmin } from "@/modules/admin/auth";

export class PersonalUnauthorizedError extends Error {}

export async function getOwner() {
  const admin = await getAdmin();
  if (!admin) return null;
  const db = getDatabase();
  await db.insert(owners).values({ authSubject: admin.email }).onConflictDoNothing({ target: owners.authSubject });
  const rows = await db.select().from(owners).where(eq(owners.authSubject, admin.email)).limit(1);
  return rows[0] ? { ...rows[0], email: admin.email } : null;
}

export async function requireOwner() {
  const owner = await getOwner();
  if (!owner) throw new PersonalUnauthorizedError("Owner authentication required");
  return owner;
}
