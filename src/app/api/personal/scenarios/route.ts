import { NextRequest } from "next/server";
import { listScenarios, saveScenario, scenarioInputSchema } from "@/modules/personal/service";
import { readJson, apiError, jsonSafe, ownerApi, privateJson } from "../_shared";
export async function GET(request: NextRequest) { try { await ownerApi(request); return privateJson(jsonSafe(await listScenarios())); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { await ownerApi(request, true); const parsed = scenarioInputSchema.safeParse(await readJson(request)); if (!parsed.success) return privateJson({ error: "Invalid input" }, { status: 400 }); return privateJson(jsonSafe(await saveScenario(parsed.data)), { status: 201 }); } catch (error) { return apiError(error); } }
