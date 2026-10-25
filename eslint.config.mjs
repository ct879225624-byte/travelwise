import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", ".cache/**", "next-env.d.ts", "drizzle/meta/**", "playwright-report/**", "test-results/**"]),
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["@/db/*"], message: "Pages cannot import database access directly; use a server-only service." }] }] },
  },
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: ["src/app/me/**", "src/app/api/personal/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{
        group: ["@/db/*", "@/modules/personal/*"],
        message: "Public pages must use public DTOs; personal records belong in authenticated server services.",
      }] }],
    },
  },
]);
