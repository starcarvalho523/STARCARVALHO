import test from "node:test";
import assert from "node:assert/strict";
import { isAsaasConfigured, isAsaasLiveConfigured, isAsaasSandboxConfigured, isAsaasWebhookConfigured, resolveAsaasRuntimeConfig } from "./asaas-config.ts";

function env(values: Record<string, string>): NodeJS.ProcessEnv { return { NODE_ENV: "test", ...values }; }

const sandbox = env({
  ASAAS_ENVIRONMENT: "sandbox",
  ASAAS_BASE_URL: "https://api-sandbox.asaas.com/v3",
  ASAAS_API_KEY: "test-sandbox-key",
  ASAAS_WEBHOOK_TOKEN: "test-sandbox-webhook",
});

const production = env({
  ASAAS_ENVIRONMENT: "production",
  ASAAS_LIVE_PAYMENTS_ENABLED: "true",
  ASAAS_BASE_URL: "https://api.asaas.com/v3",
  ASAAS_API_KEY: "test-production-key",
  ASAAS_WEBHOOK_TOKEN: "test-production-webhook",
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
    ASAAS_API_KEY: "test-production-key",
  })), /ASAAS_LIVE_PAYMENTS_DISABLED/);
});

test("production normalizes an explicitly enabled live flag", () => {
  assert.equal(resolveAsaasRuntimeConfig({ ...production, ASAAS_LIVE_PAYMENTS_ENABLED: " True " }).environment, "production");
});

test("production requires exact production URL", () => {
  const base = env({
    ASAAS_ENVIRONMENT: "production",
    ASAAS_LIVE_PAYMENTS_ENABLED: "true",
    ASAAS_API_KEY: "test-production-key",
  });
  assert.throws(() => resolveAsaasRuntimeConfig({ ...base, ASAAS_BASE_URL: "https://api-sandbox.asaas.com/v3" }), /ASAAS_BASE_URL_ENVIRONMENT_MISMATCH/);
});

test("production resolves with explicit live controls and no global customer id", () => {
  const config = resolveAsaasRuntimeConfig(production);
  assert.equal(config.environment, "production");
  assert.equal(config.providerEnvironment, "PRODUCTION");
  assert.equal(config.baseUrl, "https://api.asaas.com/v3");
});

test("charge readiness accepts configured sandbox and production runtimes", () => {
  assert.equal(isAsaasConfigured(sandbox), true);
  assert.equal(isAsaasConfigured(production), true);
});

test("charge readiness does not depend on webhook token", () => {
  const withoutWebhook = { ...production, ASAAS_WEBHOOK_TOKEN: "" };
  assert.equal(isAsaasConfigured(withoutWebhook), true);
  assert.equal(isAsaasWebhookConfigured(withoutWebhook), false);
  assert.equal(isAsaasWebhookConfigured(production), true);
});

test("environment-specific helpers preserve the active runtime", () => {
  assert.equal(isAsaasSandboxConfigured(sandbox), true);
  assert.equal(isAsaasSandboxConfigured(production), false);
  assert.equal(isAsaasLiveConfigured(production), true);
  assert.equal(isAsaasLiveConfigured(sandbox), false);
});
