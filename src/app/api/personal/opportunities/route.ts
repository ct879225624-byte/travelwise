import { NextRequest } from "next/server";
import { confirmOpportunity, personalOpportunityEngine } from "@/modules/personal/opportunity-service";
import { apiError, jsonSafe, ownerApi, privateJson, readJson } from "../_shared";
export async function GET(request: NextRequest) { try { await ownerApi(request); return privateJson(jsonSafe(await personalOpportunityEngine())); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { await ownerApi(request, true); return privateJson(jsonSafe(await confirmOpportunity(await readJson(request))), { status: 201 }); } catch (error) { return apiError(error); } }
