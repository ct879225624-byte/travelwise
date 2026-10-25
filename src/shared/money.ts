import { z } from "zod";

// V1 supports CNY only. Other currency minor units need explicit rules later.
export const cnyAmountSchema = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/);

export function cnyToMinorUnits(amount: string): bigint {
  const [whole, fraction = ""] = cnyAmountSchema.parse(amount).split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function minorUnitsToCny(amount: bigint): string {
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
