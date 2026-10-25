import { NextRequest } from "next/server";
import { membershipInputSchema, upsertMembership } from "@/modules/personal/service";
import { readJson, apiError, jsonSafe, ownerApi, privateJson } from "../_shared";
export async function POST(request: NextRequest) { try { await ownerApi(request, true); const parsed = membershipInputSchema.safeParse(await readJson(request)); if (!parsed.success) return privateJson({ error: "Invalid input" }, { status: 400 }); return privateJson(jsonSafe(await upsertMembership(parsed.data))); } catch (error) { return apiError(error); } }
