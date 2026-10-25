import { afterEach, expect, it, vi } from "vitest";

type Authorize = (raw: Record<string, unknown>) => Promise<unknown>;
const state = vi.hoisted(() => ({ authorize: undefined as Authorize | undefined, compare: vi.fn() }));
// Inspect the real application Credentials callback while isolating Auth.js transport and bcrypt cost.
vi.mock("next-auth", () => ({ default: (config: { providers: { authorize: Authorize }[] }) => {
  state.authorize = config.providers[0].authorize;
  return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
} }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: { authorize: Authorize }) => options }));
vi.mock("bcryptjs", () => ({ compare: state.compare }));

import "@/auth";

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

it("enforces cooldown in the actual Credentials callback, then authenticates only the configured account", async () => {
  vi.useFakeTimers();
  vi.stubEnv("ADMIN_EMAIL", "owner@test.local");
  vi.stubEnv("ADMIN_PASSWORD_HASH", "fixture-hash-only");
  state.compare.mockImplementation(async (password: string) => password === "fixture-correct-password");
  const authorize = state.authorize!;
  for (let i = 0; i < 10; i += 1) expect(await authorize({ email: "owner@test.local", password: "fixture-wrong-password" })).toBeNull();
  expect(await authorize({ email: "owner@test.local", password: "fixture-correct-password" })).toBeNull();
  expect(state.compare).toHaveBeenCalledTimes(10);
  vi.advanceTimersByTime(15 * 60 * 1000);
  expect(await authorize({ email: " OWNER@test.local".trim(), password: "fixture-correct-password" })).toMatchObject({ email: "owner@test.local" });
  expect(await authorize({ email: "other@test.local", password: "fixture-correct-password" })).toBeNull();
  vi.stubEnv("ADMIN_PASSWORD_HASH", "");
  expect(await authorize({ email: "owner@test.local", password: "fixture-correct-password" })).toBeNull();
});
