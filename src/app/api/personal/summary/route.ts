import { NextRequest } from "next/server";
import { dashboard } from "@/modules/personal/service";
import { apiError, jsonSafe, ownerApi, privateJson } from "../_shared";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { try { await ownerApi(request); return privateJson(jsonSafe(await dashboard())); } catch (error) { return apiError(error); } }
