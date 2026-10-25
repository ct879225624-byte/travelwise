import { NextRequest } from "next/server";
import { creditReward, rewardCreditSchema } from "@/modules/personal/service";
import { readJson, apiError, jsonSafe, ownerApi, privateJson } from "../../_shared";
export async function POST(request: NextRequest) { try { await ownerApi(request, true); const body = rewardCreditSchema.parse(await readJson(request)); return privateJson(jsonSafe(await creditReward(body.actionId, body.idempotencyKey, body.actualPoints === undefined ? undefined : BigInt(body.actualPoints), { earnedAt: body.earnedAt, expiresAt: body.expiresAt, expiryStatus: body.expiryStatus, evidenceNote: body.evidenceNote }))); } catch (error) { return apiError(error); } }
