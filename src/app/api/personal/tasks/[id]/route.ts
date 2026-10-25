import { NextRequest } from "next/server";
import { completeTask } from "@/modules/personal/service";
import { apiError, jsonSafe, ownerApi, privateJson } from "../../_shared";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { await ownerApi(request, true); return privateJson(jsonSafe(await completeTask((await params).id))); } catch (error) { return apiError(error); } }
