import { NextRequest } from "next/server";
import { realizedInputSchema, recordRealized } from "@/modules/personal/service";
import { readJson, apiError, jsonSafe, ownerApi, privateJson } from "../../_shared";
export async function POST(request: NextRequest) { try { await ownerApi(request, true); const parsed = realizedInputSchema.safeParse(await readJson(request)); if (!parsed.success) return privateJson({ error: "Invalid input" }, { status: 400 }); return privateJson(jsonSafe(await recordRealized({ ...parsed.data, points: parsed.data.points.toString() })), { status: 201 }); } catch (error) { return apiError(error); } }
