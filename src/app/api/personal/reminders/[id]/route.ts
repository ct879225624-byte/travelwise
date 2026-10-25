import { NextRequest } from "next/server";
import { updateReminder } from "@/modules/personal/opportunity-service";
import { apiError, jsonSafe, ownerApi, privateJson, readJson } from "../../_shared";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { await ownerApi(request, true); return privateJson(jsonSafe(await updateReminder((await params).id, await readJson(request)))); } catch (error) { return apiError(error); } }
