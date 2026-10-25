import { z } from "zod";

// Inputs must carry an offset or Z; never infer the execution machine timezone.
export const instantSchema = z.iso.datetime({ offset: true });
export const timeZoneSchema = z.string().refine((value) => {
  try { new Intl.DateTimeFormat("zh-CN", { timeZone: value }); return true; } catch { return false; }
}, "Use an IANA timezone.");

export function formatInstant(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timeZoneSchema.parse(timeZone), year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(instantSchema.parse(instant)));
}

export function formatLocalInput(date: Date | null | undefined, timeZone = "Asia/Shanghai"): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: timeZoneSchema.parse(timeZone), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date).replace(" ", "T");
}

// Native datetime-local controls omit an offset. Interpret them in the content's
// declared zone, independent of the deployment server's local timezone.
export function parseLocalInput(value: string, timeZone = "Asia/Shanghai"): Date {
  timeZoneSchema.parse(timeZone);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("时间格式无效");
  const wallClock = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wallClock)) throw new Error("时间格式无效");
  let result = wallClock;
  for (let attempt = 0; attempt < 3; attempt++) {
    const represented = Date.parse(`${formatLocalInput(new Date(result), timeZone)}:00Z`);
    result += wallClock - represented;
  }
  if (formatLocalInput(new Date(result), timeZone) !== value) throw new Error("时间在所选时区不存在，请核对夏令时");
  return new Date(result);
}
