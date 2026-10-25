import { describe, expect, it } from "vitest";
import { createLoginAttemptLimiter } from "@/shared/login-attempts";
import { MAX_JSON_BYTES, readJson, readLimitedText, sameOrigin } from "@/shared/request-security";
import { decode, encode } from "@auth/core/jwt";

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://travelwise.test/api/personal/points", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
}

describe("release security boundaries", () => {
  it("uses Auth.js encrypted tokens that reject expired sessions", async () => {
    const options = { secret: "unit-test-fixture-secret-not-for-deployment", salt: "authjs.session-token" };
    const token = await encode({ ...options, token: { email: "fixture@test.local" }, maxAge: 8 * 60 * 60 });
    expect((await decode({ ...options, token }))?.email).toBe("fixture@test.local");
    const expired = await encode({ ...options, token: { email: "fixture@test.local" }, maxAge: -600 });
    await expect(decode({ ...options, token: expired })).rejects.toThrow();
  });

  it("limits repeated login attempts before concurrent password checks and recovers after cooldown", () => {
    const limiter = createLoginAttemptLimiter();
    expect(Array.from({ length: 10 }, () => limiter.consume(1000))).toEqual(Array(10).fill(true));
    expect(limiter.consume(1001)).toBe(false);
    expect(limiter.consume(1000 + 15 * 60 * 1000)).toBe(true);
  });

  it("allows normal repeated owner logins after a successful password check", () => {
    const limiter = createLoginAttemptLimiter();
    for (let i = 0; i < 25; i += 1) { expect(limiter.consume(1000)).toBe(true); limiter.success(); }
  });

  it("requires matching origin scheme, host and port even when fetch metadata claims same-origin", () => {
    expect(sameOrigin(request("{}", { origin: "https://travelwise.test" }))).toBe(true);
    for (const origin of ["http://travelwise.test", "https://evil.test", "https://travelwise.test:8443", "null", "https://travelwise.test/path"]) {
      expect(sameOrigin(request("{}", { origin, "sec-fetch-site": "same-origin" }))).toBe(false);
    }
    expect(sameOrigin(request("{}"))).toBe(false);
    expect(sameOrigin(request("{}", { "sec-fetch-site": "same-site" }))).toBe(false);
    expect(sameOrigin(request("{}", { "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it("supports the real forwarded HTTPS host while rejecting protocol downgrade", () => {
    const make = (origin: string) => new Request("http://localhost:3000/api", { headers: { host: "travelwise.test", "x-forwarded-proto": "https", origin } });
    expect(sameOrigin(make("https://travelwise.test"))).toBe(true);
    expect(sameOrigin(make("http://travelwise.test"))).toBe(false);
  });

  it("reads ordinary JSON and rejects malformed or non-JSON input", async () => {
    expect(await readJson(request('{"points":"9007199254740993"}'))).toEqual({ points: "9007199254740993" });
    await expect(readJson(request("{"))).rejects.toThrow(SyntaxError);
    await expect(readJson(request("{}", { "content-type": "text/plain" }))).rejects.toMatchObject({ status: 415 });
  });

  it("rejects oversized content lengths before reading and counts streamed UTF-8 bytes when length is missing or false", async () => {
    await expect(readJson(request("{}", { "content-length": String(MAX_JSON_BYTES + 1) }))).rejects.toMatchObject({ status: 413 });
    for (const headers of [{}, { "content-length": "1" }] as Record<string, string>[]) {
      await expect(readJson(request(JSON.stringify({ text: "中".repeat(MAX_JSON_BYTES / 2) }), headers))).rejects.toMatchObject({ status: 413 });
    }
    await expect(readLimitedText(request("x".repeat(16385)), 16384)).rejects.toMatchObject({ status: 413 });
  });
});
