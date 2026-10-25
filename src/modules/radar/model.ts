import "server-only";
import { createHash } from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { z } from "zod";

export const monitorUrlSchema = z.string().trim().max(2048).url().superRefine((value, ctx) => {
  const url = new URL(value);
  if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || (url.port && !["80", "443"].includes(url.port)) || url.hostname.toLowerCase() === "localhost" || (net.isIP(url.hostname) > 0 && isPrivateIp(url.hostname))) {
    ctx.addIssue({ code: "custom", message: "仅允许公开 HTTP(S) 地址" });
  }
});

export const radarDiffSchema = z.object({ added: z.array(z.string()), removed: z.array(z.string()), changed: z.array(z.string()) });

export function isPrivateIp(value: string): boolean {
  if (net.isIPv4(value)) {
    const [a, b, c] = value.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && c === 0))) || (a === 198 && b >= 18 && b <= 19);
  }
  if (!net.isIPv6(value)) return true;
  const normalized = value.toLowerCase();
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return (mapped ? isPrivateIp(mapped[1]) : false) || normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}

export async function assertPublicUrl(value: string) {
  const parsed = monitorUrlSchema.parse(value);
  const host = new URL(parsed).hostname;
  if (net.isIP(host) && isPrivateIp(host)) throw new Error("监控地址指向受限网络");
  if (["localhost", "metadata.google.internal", "metadata", "instance-data"].includes(host.toLowerCase())) throw new Error("监控地址主机名被禁止");
  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((address) => isPrivateIp(address.address))) throw new Error("监控地址解析到受限网络");
  return parsed;
}

/** Strip layout noise while retaining visible clauses that can be reviewed. */
export function normalizeContent(input: string) {
  return input
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|nav|footer|aside|header)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\b(?:updated|更新|更新时间)\s*[:：]?\s*\d{4}[./-]\d{1,2}[./-]\d{1,2}(?:\s+\d{1,2}:\d{2})?/gi, " ")
    .split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean)
    .filter((line, index, all) => line.length >= 2 && all.indexOf(line) === index)
    .join("\n").slice(0, 500_000);
}

export function extractMonitorRegion(input: string, selector?: string | null) {
  if (!selector?.trim()) return input;
  const token = selector.trim();
  const escaped = token.startsWith("#") || token.startsWith(".") ? token.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : null;
  if (!escaped) return input;
  const attr = token.startsWith("#") ? `(?:id=["']${escaped}["']|id=${escaped})` : `(?:class=["'][^"']*\\b${escaped}\\b[^"']*["'])`;
  const match = input.match(new RegExp(`<([a-z0-9]+)[^>]*${attr}[^>]*>[\\s\\S]*?<\\/\\1>`, "i"));
  return match?.[0] ?? input;
}

export function fingerprint(content: string) { return createHash("sha256").update(content).digest("hex"); }

function setLines(content: string) { return new Set(content.split("\n").map((line) => line.trim()).filter(Boolean)); }

export function compareContent(previous: string | null, current: string) {
  if (!previous) return { meaningful: false, added: current ? current.split("\n").slice(0, 50) : [], removed: [], changed: [], summary: "首次建立内容基线" };
  if (previous === current) return { meaningful: false, added: [], removed: [], changed: [], summary: "无变化" };
  const before = setLines(previous); const after = setLines(current);
  const added = [...after].filter((line) => !before.has(line)).slice(0, 100);
  const removed = [...before].filter((line) => !after.has(line)).slice(0, 100);
  const changed = added.filter((line) => /\d|积分|奖励|门槛|条件|报名|消费|预订|入住|领取|叠加|截止|仅限|每次|上限|元|%/.test(line)).slice(0, 50);
  const meaningful = added.some((line) => /\d|积分|奖励|门槛|条件|报名|消费|预订|入住|领取|叠加|截止|仅限|每次|上限|元|%/.test(line)) || removed.some((line) => /\d|积分|奖励|门槛|条件|报名|消费|预订|入住|领取|叠加|截止|仅限|每次|上限|元|%/.test(line));
  return { meaningful, added, removed, changed, summary: meaningful ? `发现 ${added.length} 条新增、${removed.length} 条删除内容` : "检测到排版或无关内容变化" };
}

export type PublicFetchResult = { url: string; status: number; contentType: string | null; body: string; etag: string | null; lastModified: string | null; notModified: boolean };
export class PublicFetchError extends Error { constructor(message: string, public readonly status?: number) { super(message); } }

export async function fetchPublicResource(input: string, headers: { etag?: string | null; lastModified?: string | null } = {}, options: { timeoutMs?: number; maxBytes?: number } = {}): Promise<PublicFetchResult> {
  let current = await assertPublicUrl(input);
  const timeoutMs = options.timeoutMs ?? 15_000; const maxBytes = options.maxBytes ?? 1_500_000;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(current, { redirect: "manual", signal: controller.signal, headers: { "user-agent": "TravelWise-Radar/1.1", ...(headers.etag ? { "if-none-match": headers.etag } : {}), ...(headers.lastModified ? { "if-modified-since": headers.lastModified } : {}) } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location"); if (!location) throw new Error("来源重定向缺少地址");
        current = await assertPublicUrl(new URL(location, current).toString()); continue;
      }
      if (response.status === 304) return { url: current, status: response.status, contentType: response.headers.get("content-type"), body: "", etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified"), notModified: true };
      if (!response.ok) throw new PublicFetchError(`来源返回 HTTP ${response.status}`, response.status);
      const declared = Number(response.headers.get("content-length") ?? 0); if (declared > maxBytes) throw new Error("来源响应超过大小上限");
      const reader = response.body?.getReader(); if (!reader) throw new Error("来源响应为空");
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new Error("来源响应超过大小上限"); } chunks.push(value); }
      const body = new TextDecoder().decode(Buffer.concat(chunks));
      return { url: current, status: response.status, contentType: response.headers.get("content-type"), body, etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified"), notModified: false };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("来源请求超时");
      throw error;
    } finally { clearTimeout(timer); }
  }
  throw new Error("来源重定向次数超过上限");
}
