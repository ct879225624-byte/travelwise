import { z } from "zod";

export const pointValueSchema = z.string().regex(/^(0|[1-9]\d{0,5})(\.\d{1,6})?$/, "每积分估值需为 0 至 999999.999999 的十进制数");
export const pointsSchema = z.string().regex(/^\d{1,15}$/, "积分必须是非负整数，最多 15 位");
export const minorAmountSchema = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/, "金额需为非负、最多两位小数的人民币");

const MICROS_PER_YUAN = 1_000_000n;
const MICROS_PER_MINOR = 10_000n;

export function parsePointValue(value: string): bigint {
  pointValueSchema.parse(value);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * MICROS_PER_YUAN + BigInt(fraction.padEnd(6, "0"));
}

export function parsePoints(value: string): bigint {
  return BigInt(pointsSchema.parse(value));
}

export function parseMinor(value: string): bigint {
  minorAmountSchema.parse(value);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function formatMinor(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function formatMicros(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / MICROS_PER_YUAN;
  const fraction = String(absolute % MICROS_PER_YUAN).padStart(6, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function moneyToMicros(minor: bigint): bigint { return minor * MICROS_PER_MINOR; }

export function pointsValue(points: bigint, valueMicrosPerPoint: bigint): bigint { return points * valueMicrosPerPoint; }

export function floorDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("分母必须为正数");
  return numerator >= 0n ? numerator / denominator : -((-numerator + denominator - 1n) / denominator);
}

export function formatRatio(numerator: bigint, denominator: bigint, decimals = 7): string {
  if (denominator <= 0n) return "";
  const scale = 10n ** BigInt(decimals);
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const scaled = (absolute * scale + denominator / 2n) / denominator;
  const whole = scaled / scale;
  const fraction = String(scaled % scale).padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function assertNonNegative(name: string, value: bigint) {
  if (value < 0n) throw new Error(`${name} 不能为负数`);
}

export function assertBoundedInteger(name: string, value: number, max: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new Error(`${name} 超出允许范围`);
}

export const microsPerYuan = MICROS_PER_YUAN;
