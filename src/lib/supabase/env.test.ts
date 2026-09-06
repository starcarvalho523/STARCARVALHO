import test from "node:test";
import assert from "node:assert/strict";
import {
  getServerSupabaseEnvironment,
  isVercelPreviewRuntime,
} from "./env.ts";

const testEnv = (overrides: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: "test",
  ...overrides,
});

test("detects any Vercel preview runtime", () => {
  assert.equal(isVercelPreviewRuntime(testEnv({ VERCEL_ENV: "preview" })), true);
  assert.equal(isVercelPreviewRuntime(testEnv({ VERCEL_ENV: "production" })), false);
  assert.equal(isVercelPreviewRuntime(testEnv()), false);
});

test("routes arbitrary Vercel preview branches to QA Supabase", () => {
  const resolved = getServerSupabaseEnvironment(
    testEnv({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "feature/arbitrary-preview",
    }),
  );

  assert.equal(resolved.environment, "qa");
  assert.equal(resolved.url, "https://hqdaqijgloeiqrljulqx.supabase.co");
  assert.match(resolved.publishableKey, /^sb_publishable_/);
});
