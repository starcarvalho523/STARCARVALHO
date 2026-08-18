import test from "node:test";
import assert from "node:assert/strict";
import { resolveAsaasRuntimeConfig } from "./asaas-config.ts";

function env(values: Record<string, string>): NodeJS.ProcessEnv { return { NODE_ENV: "test", ...values }; }

const sandbox = env({
  ASAAS_ENVIRONMENT: "sandbox",
  ASAAS_BASE_URL: "https://api-sandbox.asaas.com/v3",
  ASAAS_API_KEY: "sandbox-key",
});

test("resolves sandbox without enabling live payments", () => {
  const config = resolveAsaasRuntimeConfig(sandbox);
  assert.equal(config.environment, "sandbox");
  assert.equal(config.providerEnvironment, "SANDBOX");
});

test("production fails closed unless live flag is explicit", () => {
  assert.throws(() => resolveAsaasRuntimeConfig(env({
    ASAAS_ENVIRONMENT: "production",
    ASAAS_BASE_URL: "https://api.asaas.com/v3",
    ASAAS_API_KEY: "live-key",
  })), /ASAAS_LIVE_PAYMENTS_DISABLED/);
});

test("production requires exact production URL", () => {
  const base = env({
    ASAAS_ENVIRONMENT: "production",
    ASAAS_LIVE_PAYMENTS_ENABLED: "true",
    ASAAS_API_KEY: "live-key",
  });
  assert.throws(() => resolveAsaasRuntimeConfig({ ...base, ASAAS_BASE_URL: "https://api-sandbox.asaas.com/v3" }), /ASAAS_BASE_URL_ENVIRONMENT_MISMATCH/);
});

test("production resolves with explicit live controls and no global customer id", () => {
  const config = resolveAsaasRuntimeConfig(env({
    ASAAS_ENVIRONMENT: "production",
    ASAAS_LIVE_PAYMENTS_ENABLED: "true",
    ASAAS_BASE_URL: "https://api.asaas.com/v3",
    ASAAS_API_KEY: "live-key",
  }));
  assert.equal(config.environment, "production");
  assert.equal(config.providerEnvironment, "PRODUCTION");
  assert.equal(config.baseUrl, "https://api.asaas.com/v3");
});
