export const MAX_JSON_BYTES = 128 * 1024;

export class RequestBodyError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const url = new URL(request.url);
    const host = request.headers.get("host") ?? url.host;
    // The reverse proxy must overwrite forwarded headers, never append client values.
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? url.protocol.slice(0, -1);
    if (!["http", "https"].includes(protocol)) return false;
    return origin === `${protocol}://${host}`;
  } catch { return false; }
}

export async function readLimitedText(request: Request, limit = MAX_JSON_BYTES) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new RequestBodyError(413, "Request body too large");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      void reader.cancel();
      throw new RequestBodyError(413, "Request body too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function readJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new RequestBodyError(415, "JSON content type required");
  return JSON.parse(await readLimitedText(request));
}
