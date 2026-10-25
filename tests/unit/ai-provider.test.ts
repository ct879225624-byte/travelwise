import { describe, expect, it, vi } from "vitest";
import { emptyExtraction, parseActivityExtraction } from "@/modules/ai/model";
import { analyzeWithAvailableProvider, OpenAiProvider } from "@/modules/ai/provider";

describe("V1.1 AI extraction contract", () => {
  it("returns unknown for fields absent from the source", () => {
    const result = parseActivityExtraction({ activityName: { value: "春季活动", evidence: ["标题"], uncertain: false, manuallyRevised: false } }, "https://example.com/a");
    expect(result.activityName.value).toBe("春季活动"); expect(result.reward.value).toBe("未知"); expect(result.reward.uncertain).toBe(true);
    expect(emptyExtraction().source.url).toBeNull();
  });
  it("reports real AI as blocked when no server credential exists", async () => {
    const previous = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
    const result = await analyzeWithAvailableProvider({ url: null, text: "活动原文", imageBase64: null, imageMime: null });
    expect("blocked" in result && result.blocked).toBe(true);
    if (previous) process.env.OPENAI_API_KEY = previous;
  });
  it("keeps malformed and rate-limited provider responses as explicit errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ output_text: "not-json" }), { status: 200 })).mockResolvedValueOnce(new Response("{}", { status: 429 })));
    const provider = new OpenAiProvider("unit-test-key");
    await expect(provider.analyze({ url: null, text: "原文", imageBase64: null, imageMime: null })).rejects.toThrow("不是 JSON");
    await expect(provider.analyze({ url: null, text: "原文", imageBase64: null, imageMime: null })).rejects.toThrow("限流");
    vi.restoreAllMocks();
  });
});
