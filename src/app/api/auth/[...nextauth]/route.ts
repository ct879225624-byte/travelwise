import { handlers } from "@/auth";
import { NextRequest } from "next/server";
import { RequestBodyError, readLimitedText } from "@/shared/request-security";

export const { GET } = handlers;
export async function POST(request: NextRequest) {
  try {
    const body = await readLimitedText(request, 16 * 1024);
    return await handlers.POST(new NextRequest(request.url, { method: "POST", headers: request.headers, body }));
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
