import { describe, expect, it } from "vitest";
import { formatInstant, formatLocalInput, parseLocalInput, instantSchema, timeZoneSchema } from "@/shared/time";

describe("timezone aware instants", () => {
  it("requires an explicit offset and accepts IANA zones", () => {
    expect(instantSchema.parse("2026-01-01T00:00:00+08:00")).toContain("+08:00");
    expect(() => instantSchema.parse("2026-01-01T00:00:00")).toThrow();
    expect(timeZoneSchema.parse("Asia/Shanghai")).toBe("Asia/Shanghai");
    expect(() => timeZoneSchema.parse("Not/AZone")).toThrow();
  });

  it("formats the same instant in the record's zone", () => {
    expect(formatInstant("2026-01-01T00:00:00Z", "Asia/Shanghai")).toContain("08:00");
  });

  it("round trips admin local dates in the declared timezone independently of server timezone", () => {
    const date = parseLocalInput("2026-10-20T12:30", "Asia/Shanghai");
    expect(date.toISOString()).toBe("2026-10-20T04:30:00.000Z");
    expect(formatLocalInput(date, "Asia/Shanghai")).toBe("2026-10-20T12:30");
    expect(parseLocalInput("2026-07-01T12:30", "America/New_York").toISOString()).toBe("2026-07-01T16:30:00.000Z");
    expect(() => parseLocalInput("2026-03-08T02:30", "America/New_York")).toThrow("不存在");
    expect(() => parseLocalInput("2026-02-30T12:30", "Asia/Shanghai")).toThrow();
  });
});
