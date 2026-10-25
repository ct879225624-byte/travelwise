import { NextRequest } from "next/server";
import { createTask, dashboard, taskInputSchema } from "@/modules/personal/service";
import { readJson, apiError, jsonSafe, ownerApi, privateJson } from "../_shared";
export async function GET(request: NextRequest) { try { await ownerApi(request); return privateJson(jsonSafe((await dashboard()).tasks)); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { await ownerApi(request, true); const parsed = taskInputSchema.safeParse(await readJson(request)); if (!parsed.success) return privateJson({ error: "Invalid input" }, { status: 400 }); return privateJson(jsonSafe(await createTask(parsed.data)), { status: 201 }); } catch (error) { return apiError(error); } }
