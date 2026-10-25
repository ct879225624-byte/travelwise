import { describe, expect, it } from "vitest";
import { cnyToMinorUnits, minorUnitsToCny } from "@/shared/money";

describe("CNY minor units", () => {
  it("round-trips decimal amounts without floating point", () => {
    expect(cnyToMinorUnits("120.50")).toBe(12050n);
    expect(minorUnitsToCny(12050n)).toBe("120.50");
    expect(minorUnitsToCny(-5n)).toBe("-0.05");
  });

  it("rejects more than two decimal places", () => {
    expect(() => cnyToMinorUnits("1.001")).toThrow();
  });
});
