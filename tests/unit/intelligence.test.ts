import { describe, expect, it } from "vitest";
import { demoPromotions } from "@/modules/intelligence/demo";
import { getPromotionState, publicPromotionSchema } from "@/modules/intelligence/model";

describe("intelligence public contract", () => {
  it("keeps demo data visibly marked and evidence-linked", () => {
    const promotion = demoPromotions[0];
    expect(publicPromotionSchema.parse(promotion).isDemo).toBe(true);
    expect(promotion.title.startsWith("DEMO")).toBe(true);
    expect(promotion.evidence[0]?.isDemo).toBe(true);
  });

  it("treats an offer end as exclusive", () => {
    const promotion = demoPromotions[0];
    expect(getPromotionState(promotion, new Date("2026-10-09T02:00:00.000Z"))).toBe("进行中");
    expect(getPromotionState(promotion, new Date("2026-12-01T00:00:00.000Z"))).toBe("已结束");
    expect(getPromotionState({ ...promotion, isSuspended: true }, new Date())).toBe("已暂停");
  });
});
