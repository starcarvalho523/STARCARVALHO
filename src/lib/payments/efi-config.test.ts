import assert from "node:assert/strict";
import test from "node:test";
import { resolveEfiPixRuntimeConfig, resolveEfiRuntimeConfig } from "./efi-config.ts";

const sandboxCertificate = Buffer.from("sandbox-p12").toString("base64");
const productionCertificate = Buffer.from("production-p12").toString("base64");
const sandbox = {
  EFI_ENABLED: "true",
  EFI_ENVIRONMENT: "sandbox",
  EFI_CLIENT_ID: "client",
  EFI_CLIENT_SECRET: "secret",
  EFI_CERTIFICATE_BASE64: sandboxCertificate,
} as unknown as NodeJS.ProcessEnv;

const production = {
  EFI_ENABLED: "true",
  EFI_ENVIRONMENT: "production",
  EFI_PIX_PRODUCTION_ENABLED: "true",
  EFI_PIX_PRODUCTION_CLIENT_ID: "prod-client",
  EFI_PIX_PRODUCTION_CLIENT_SECRET: "prod-secret",
  EFI_PIX_PRODUCTION_CERTIFICATE_BASE64: productionCertificate,
} as unknown as NodeJS.ProcessEnv;

test("Efí stays disabled without an explicit enablement flag", () =>
  assert.throws(() => resolveEfiRuntimeConfig({} as NodeJS.ProcessEnv), /EFI_DISABLED/));

test("Efí requires an environment", () =>
  assert.throws(() => resolveEfiRuntimeConfig({ EFI_ENABLED: "true" } as unknown as NodeJS.ProcessEnv), /EFI_ENVIRONMENT_NOT_CONFIGURED/));

test("Efí Pix production stays fail-closed without its explicit gate", () =>
  assert.throws(() => resolveEfiRuntimeConfig({ ...production, EFI_PIX_PRODUCTION_ENABLED: "false" }), /EFI_PIX_PRODUCTION_DISABLED/));

test("Efí Pix production requires dedicated credentials and certificate", () => {
  assert.throws(() => resolveEfiRuntimeConfig({ ...production, EFI_PIX_PRODUCTION_CLIENT_ID: "" }), /EFI_PRODUCTION_CLIENT_ID_MISSING/);
  assert.throws(() => resolveEfiRuntimeConfig({ ...production, EFI_PIX_PRODUCTION_CLIENT_SECRET: "" }), /EFI_PRODUCTION_CLIENT_SECRET_MISSING/);
  assert.throws(() => resolveEfiRuntimeConfig({ ...production, EFI_PIX_PRODUCTION_CERTIFICATE_BASE64: "" }), /EFI_CERTIFICATE_MISSING/);
  assert.throws(() => resolveEfiRuntimeConfig({ ...production, EFI_PIX_PRODUCTION_CERTIFICATE_BASE64: "not base64!" }), /EFI_CERTIFICATE_INVALID/);
});

test("Efí Pix production resolves the production API and provider environment", () => {
  const config = resolveEfiRuntimeConfig(production);
  assert.equal(config.environment, "production");
  assert.equal(config.providerEnvironment, "PRODUCTION");
  assert.equal(config.baseUrl, "https://pix.api.efipay.com.br");
  assert.deepEqual(config.certificateP12, Buffer.from("production-p12"));
});

test("Efí Pix production requires a dedicated production PIX key", () => {
  assert.throws(() => resolveEfiPixRuntimeConfig(production), /EFI_PRODUCTION_PIX_KEY_MISSING/);
  const config = resolveEfiPixRuntimeConfig({
    ...production,
    EFI_PIX_PRODUCTION_KEY: "pix-production-key",
    EFI_PIX_PRODUCTION_PAYEE_CODE: "payee-production",
  });
  assert.equal(config.pixKey, "pix-production-key");
  assert.equal(config.payeeCode, "payee-production");
});

test("Sandbox OAuth keeps the homologation origin and requires no PIX key", () => {
  const config = resolveEfiRuntimeConfig(sandbox);
  assert.equal(config.environment, "sandbox");
  assert.equal(config.providerEnvironment, "SANDBOX");
  assert.equal(config.baseUrl, "https://pix-h.api.efipay.com.br");
  assert.deepEqual(config.certificateP12, Buffer.from("sandbox-p12"));
  assert.throws(() => resolveEfiPixRuntimeConfig(sandbox), /EFI_PIX_KEY_MISSING/);
});
