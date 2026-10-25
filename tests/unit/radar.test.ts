import dns from "node:dns/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compareContent, fetchPublicResource, fingerprint, isPrivateIp, monitorUrlSchema, normalizeContent } from "@/modules/radar/model";

describe("V1.1 radar normalization and safety", () => {
  afterEach(() => vi.restoreAllMocks());
  it("removes layout noise and stable timestamps", () => {
    const value = normalizeContent("<nav>菜单</nav><main>每次入住奖励 1,000 积分</main><footer>更新：2026-01-01</footer>");
    expect(value).toBe("每次入住奖励 1,000 积分");
  });
  it("creates a baseline without an alert and detects meaningful terms later", () => {
    expect(compareContent(null, "活动条款").meaningful).toBe(false);
    const diff = compareContent("每次入住奖励 1,000 积分", "每次入住奖励 2,000 积分");
    expect(diff.meaningful).toBe(true); expect(diff.changed).toContain("每次入住奖励 2,000 积分");
    expect(fingerprint("a")).toBe(fingerprint("a"));
  });
  it("rejects private and credentialed monitor addresses", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true); expect(isPrivateIp("10.0.0.5")).toBe(true); expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(() => monitorUrlSchema.parse("http://127.0.0.1")).toThrow();
    expect(() => monitorUrlSchema.parse("http://localhost")).toThrow();
    expect(() => monitorUrlSchema.parse("http://user:pass@example.com")).toThrow();
    expect(() => monitorUrlSchema.parse("file:///etc/passwd")).toThrow();
  });
  it("validates every redirect, honors validators and caps response size", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as unknown as Awaited<ReturnType<typeof dns.lookup>>);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://example.com/next" } }))
      .mockResolvedValueOnce(new Response("奖励 2,000 积分", { status: 200, headers: { "content-type": "text/html", etag: "v2" } })));
    const redirected = await fetchPublicResource("https://example.com/start");
    expect(redirected.body).toContain("2,000"); expect(vi.mocked(fetch).mock.calls).toHaveLength(2);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 304, headers: { etag: "v2" } })));
    expect((await fetchPublicResource("https://example.com/start", { etag: "v2" })).notModified).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oversized", { status: 200, headers: { "content-length": "999" } })));
    await expect(fetchPublicResource("https://example.com/start", {}, { maxBytes: 10 })).rejects.toThrow("大小上限");
  });
});
