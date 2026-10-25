import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ authenticated: true, postAuth: vi.fn(), save: vi.fn() }));
vi.mock("@/auth", () => ({ handlers: { GET: vi.fn(), POST: state.postAuth } }));
vi.mock("@/modules/admin/auth", () => {
  class AdminUnauthorizedError extends Error {}
  return { AdminUnauthorizedError, requireAdminApi: async () => {
    if (!state.authenticated) throw new AdminUnauthorizedError();
    return { email: "security@test.local" };
  } };
});
vi.mock("@/modules/personal/auth", () => ({ PersonalUnauthorizedError: class extends Error {}, requireOwner: vi.fn() }));
vi.mock("@/modules/admin/service", () => ({
  listAdminPromotions: async () => [{ promotion: { rewardAmount: 2800n, publicationStatus: "draft" } }],
  promotionInputSchema: { safeParse: () => ({ success: true, data: {} }) }, savePromotion: state.save,
}));

import { GET, POST } from "@/app/api/admin/promotions/route";
import { POST as authPost } from "@/app/api/auth/[...nextauth]/route";

beforeEach(() => { state.authenticated = true; state.save.mockReset(); state.postAuth.mockReset(); });

describe("release route security", () => {
  it("requires admin authentication before reading or writing draft data", async () => {
    state.authenticated = false;
    expect((await GET()).status).toBe(401);
    expect((await POST(new NextRequest("https://travelwise.test/api/admin/promotions", { method: "POST" }))).status).toBe(401);
    expect(state.save).not.toHaveBeenCalled();
  });

  it("serializes bigint admin rewards and prohibits shared/private response caching", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ promotion: { rewardAmount: "2800", publicationStatus: "draft" } }]);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects cross-scheme admin writes despite same-origin metadata", async () => {
    const response = await POST(new NextRequest("https://travelwise.test/api/admin/promotions", { method: "POST", headers: { origin: "http://travelwise.test", "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: "{}" }));
    expect(response.status).toBe(403);
    expect(state.save).not.toHaveBeenCalled();
  });

  it("stops oversized auth bodies before they enter the authentication library", async () => {
    const response = await authPost(new NextRequest("https://travelwise.test/api/auth/callback/credentials", { method: "POST", body: "x".repeat(16385) }));
    expect(response.status).toBe(413);
    expect(state.postAuth).not.toHaveBeenCalled();
  });

  it("preserves a normal auth request body and CSRF cookie for Auth.js validation", async () => {
    state.postAuth.mockImplementationOnce(async (request: Request) => {
      expect(await request.text()).toBe("csrfToken=fixture&email=test%40example.test");
      expect(request.headers.get("cookie")).toBe("authjs.csrf-token=test-fixture");
      return new Response(null, { status: 200 });
    });
    const response = await authPost(new NextRequest("https://travelwise.test/api/auth/callback/credentials", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: "authjs.csrf-token=test-fixture" }, body: "csrfToken=fixture&email=test%40example.test" }));
    expect(response.status).toBe(200);
    expect(state.postAuth).toHaveBeenCalledOnce();
  });
});
