import { NextRequest } from "next/server";
import { getPromotion } from "@/modules/intelligence/service";
import { resolvePublishedRule } from "@/modules/decision/service";

export const dynamic = "force-dynamic";

// Reuse the public DTO boundary: private participation and unpublished rules never enter this response.
export async function GET(request: NextRequest) {
  const promotion = await getPromotion(request.nextUrl.searchParams.get("promotion") ?? "");
  const ruleApplicability = promotion?.ruleVersion && !promotion.isDemo ? await resolvePublishedRule(promotion.ruleVersion.id, new Date().toISOString()) : null;
  return Response.json({ promotion, ruleApplicability }, { status: promotion ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
