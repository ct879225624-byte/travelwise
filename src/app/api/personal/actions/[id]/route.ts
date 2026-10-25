import { NextRequest } from "next/server";
import { actionUpdateSchema, updateAction } from "@/modules/personal/service";
import { readJson, apiError, jsonSafe, ownerApi, privateJson } from "../../_shared";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { await ownerApi(request, true); const body = actionUpdateSchema.parse(await readJson(request)); return privateJson(jsonSafe(await updateAction((await params).id, body.status, body.notes, { progress: body.progress, expectedRewardPoints: body.expectedRewardPoints }))); } catch (error) { return apiError(error); } }
