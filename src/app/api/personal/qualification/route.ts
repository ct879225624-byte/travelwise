import { NextRequest } from "next/server";
import { checkMembershipConditions, membershipCheckSchema } from "@/modules/personal/service";
import { readJson, apiError, ownerApi, privateJson } from "../_shared";

export async function POST(request: NextRequest) {
  try { await ownerApi(request, true); return privateJson(await checkMembershipConditions(membershipCheckSchema.parse(await readJson(request)))); }
  catch (error) { return apiError(error); }
}
