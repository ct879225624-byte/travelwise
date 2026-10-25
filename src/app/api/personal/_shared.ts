import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { PersonalUnauthorizedError, requireOwner } from "@/modules/personal/auth";
import { RequestBodyError, sameOrigin } from "@/shared/request-security";
export { readJson, sameOrigin } from "@/shared/request-security";

export function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item instanceof Date ? item.toISOString() : item));
}

export async function ownerApi(request: NextRequest, mutate = false) {
  const owner = await requireOwner();
  if (mutate && !sameOrigin(request)) throw new Error("CSRF validation failed");
  return owner;
}

export function apiError(error: unknown) {
  if (error instanceof PersonalUnauthorizedError) return privateJson({ error: "Unauthorized" }, { status: 401 });
  if (error instanceof RequestBodyError) return privateJson({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError || error instanceof ZodError) return privateJson({ error: "Invalid input" }, { status: 400 });
  // Database errors may include SQL and personal parameters. Never return them.
  const message = error instanceof Error && (/[\u4e00-\u9fff]/.test(error.message) && !error.message.includes("query:") || error.message === "CSRF validation failed") ? error.message : "Unable to process request";
  return privateJson({ error: message }, { status: message === "CSRF validation failed" ? 403 : 400 });
}

export function privateJson(value: unknown, init: ResponseInit = {}) {
  return Response.json(value, { ...init, headers: { ...init.headers, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
