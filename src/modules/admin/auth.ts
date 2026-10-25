import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function getAdmin() {
  const session = await auth();
  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return configuredEmail && session?.user?.email?.toLowerCase() === configuredEmail ? { email: configuredEmail } : null;
}

export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function requireAdminApi() {
  const admin = await getAdmin();
  if (!admin) throw new AdminUnauthorizedError();
  return admin;
}

export class AdminUnauthorizedError extends Error {}
