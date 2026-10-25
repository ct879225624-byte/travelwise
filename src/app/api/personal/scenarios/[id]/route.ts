import { NextRequest } from "next/server";
import { deleteScenario, scenarioMetadataSchema, updateScenarioMetadata } from "@/modules/personal/service";
import { readJson, apiError, jsonSafe, ownerApi, privateJson } from "../../_shared";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { await ownerApi(request, true); const parsed = scenarioMetadataSchema.safeParse(await readJson(request)); if (!parsed.success) return privateJson({ error: "Invalid input" }, { status: 400 }); return privateJson(jsonSafe(await updateScenarioMetadata((await params).id, parsed.data))); } catch (error) { return apiError(error); } }
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { await ownerApi(request, true); return privateJson(jsonSafe(await deleteScenario((await params).id))); } catch (error) { return apiError(error); } }
