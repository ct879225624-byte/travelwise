import { NextRequest } from "next/server";
import { requireAdminApi, AdminUnauthorizedError } from "@/modules/admin/auth";
import { listAdminPromotions, promotionInputSchema, savePromotion } from "@/modules/admin/service";
import { RequestBodyError, readJson, sameOrigin } from "@/shared/request-security";
import { jsonSafe, privateJson } from "@/app/api/personal/_shared";

export async function GET() { try { await requireAdminApi(); return privateJson(jsonSafe(await listAdminPromotions())); } catch (error) { if (error instanceof AdminUnauthorizedError) return privateJson({ error: "Unauthorized" }, { status: 401 }); return privateJson({ error: "Unable to load promotions" }, { status: 503 }); } }
export async function POST(request: NextRequest) { try { const admin = await requireAdminApi(); if (!sameOrigin(request)) return privateJson({ error: "CSRF validation failed" }, { status: 403 }); const parsed = promotionInputSchema.safeParse(await readJson(request)); if (!parsed.success) return privateJson({ error: "Invalid input" }, { status: 400 }); const id = await savePromotion(parsed.data, null, admin.email); return privateJson({ id }, { status: 201 }); } catch (error) { if (error instanceof AdminUnauthorizedError) return privateJson({ error: "Unauthorized" }, { status: 401 }); if (error instanceof RequestBodyError) return privateJson({ error: error.message }, { status: error.status }); return privateJson({ error: "Unable to save promotion" }, { status: 400 }); } }
