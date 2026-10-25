import { NextRequest } from "next/server";
import { addPoints, adjustPoints, adjustmentInputSchema, consumeInputSchema, consumePoints, dashboard, expireInputSchema, expirePoints, pointsInputSchema } from "@/modules/personal/service";
import { readJson, apiError, jsonSafe, ownerApi, privateJson } from "../_shared";
export async function GET(request: NextRequest) { try { await ownerApi(request); const result = await dashboard(); return privateJson(jsonSafe({ batches: result.batches, summary: result.summary })); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) {
  try {
    await ownerApi(request, true);
    const body = await readJson(request) as Record<string, unknown>;
    if (body.op === "credit") {
      const parsed = pointsInputSchema.safeParse(body); if (!parsed.success) return privateJson({ error: "Invalid input" }, { status: 400 });
      return privateJson(jsonSafe(await addPoints({ ...parsed.data, points: parsed.data.points.toString() })), { status: 201 });
    }
    if (body.op === "adjustment") {
      const parsed = adjustmentInputSchema.safeParse(body); if (!parsed.success) return privateJson({ error: "Invalid input" }, { status: 400 });
      return privateJson(jsonSafe(await adjustPoints({ ...parsed.data, points: parsed.data.points.toString() })), { status: 201 });
    }
    if (body.op === "consume") {
      const parsed = consumeInputSchema.safeParse(body); if (!parsed.success) return privateJson({ error: "Invalid input" }, { status: 400 });
      return privateJson(jsonSafe(await consumePoints({ ...parsed.data, points: parsed.data.points.toString() })));
    }
    if (body.op === "expire") {
      const parsed = expireInputSchema.safeParse(body); if (!parsed.success) return privateJson({ error: "Invalid input" }, { status: 400 });
      return privateJson(jsonSafe(await expirePoints(parsed.data)));
    }
    return privateJson({ error: "Unsupported points operation" }, { status: 400 });
  } catch (error) { return apiError(error); }
}
