import assert from "node:assert/strict";
import test from "node:test";
import {
  isEfiCreditCardProductionConfigured,
  resolveEfiCreditCardConfig,
  resolveEfiCreditCardProductionConfig,
} from "./efi-credit-card-config.ts";

const sandbox = {
  EFI_CARD_CLIENT_ID: "card-client",
  EFI_CARD_CLIENT_SECRET: "card-secret",
  EFI_CARD_NOTIFICATION_URL: "https://example.test/api/internal/efi-card-notification",
} as unknown as NodeJS.ProcessEnv;

const production = {
  EFI_CARD_PRODUCTION_CLIENT_ID: "prod-card-client",
  EFI_CARD_PRODUCTION_CLIENT_SECRET: "prod-card-secret",
  EFI_CARD_PRODUCTION_NOTIFICATION_URL: "https://starcarvalho.vercel.app/api/internal/efi-card-notification",
} as unknown as NodeJS.ProcessEnv;

test("Efí card requires dedicated server-side credentials", () => {
  assert.throws(() => resolveEfiCreditCardConfig({} as NodeJS.ProcessEnv), /EFI_CARD_CREDENTIALS_MISSING/);
  assert.throws(() => resolveEfiCreditCardConfig({ ...sandbox, EFI_CARD_CLIENT_ID: "" }), /EFI_CARD_CREDENTIALS_MISSING/);
  assert.throws(() => resolveEfiCreditCardConfig({ ...sandbox, EFI_CARD_CLIENT_SECRET: "" }), /EFI_CARD_CREDENTIALS_MISSING/);
  assert.throws(
    () => resolveEfiCreditCardConfig({
      ...sandbox,
      EFI_CARD_CLIENT_ID: "",
      EFI_CLIENT_ID: "pix-client",
      EFI_CLIENT_SECRET: "pix-secret",
      EFI_ENVIRONMENT: "sandbox",
    }),
    /EFI_CARD_CREDENTIALS_MISSING/,
  );
});

test("active Efí card config remains sandbox-only even when Production vars exist", () => {
  const config = resolveEfiCreditCardConfig({
    ...sandbox,
    ...production,
    EFI_ENVIRONMENT: "production",
    EFI_CARD_ENVIRONMENT: "production",
    EFI_ENABLED: "true",
  });
  assert.equal(config.baseUrl, "https://cobrancas-h.api.efipay.com.br");
  assert.equal(config.clientId, "card-client");
});

test("Efí card requires an HTTPS Sandbox notification URL", () => {
  assert.throws(() => resolveEfiCreditCardConfig({ ...sandbox, EFI_CARD_NOTIFICATION_URL: "" }), /EFI_CARD_NOTIFICATION_URL_MISSING/);
  assert.throws(() => resolveEfiCreditCardConfig({ ...sandbox, EFI_CARD_NOTIFICATION_URL: "not-a-url" }), /EFI_CARD_NOTIFICATION_URL_INVALID/);
  assert.throws(() => resolveEfiCreditCardConfig({ ...sandbox, EFI_CARD_NOTIFICATION_URL: "http://example.test/hook" }), /EFI_CARD_NOTIFICATION_URL_INVALID/);
});

test("Efí card resolves only the fixed Sandbox billing origin", () => {
  const config = resolveEfiCreditCardConfig(sandbox);
  assert.equal(config.baseUrl, "https://cobrancas-h.api.efipay.com.br");
  assert.equal(config.notificationUrl, "https://example.test/api/internal/efi-card-notification");
});

test("Production readiness uses dedicated credentials and fixed Production origin", () => {
  const config = resolveEfiCreditCardProductionConfig({ ...sandbox, ...production });
  assert.equal(config.baseUrl, "https://cobrancas.api.efipay.com.br");
  assert.equal(config.clientId, "prod-card-client");
  assert.equal(config.clientSecret, "prod-card-secret");
  assert.equal(config.notificationUrl, "https://starcarvalho.vercel.app/api/internal/efi-card-notification");
});

test("Production readiness never falls back to Sandbox or Pix credentials", () => {
  assert.throws(() => resolveEfiCreditCardProductionConfig(sandbox), /EFI_CARD_PRODUCTION_CREDENTIALS_MISSING/);
  assert.throws(
    () => resolveEfiCreditCardProductionConfig({
      EFI_CLIENT_ID: "pix-client",
      EFI_CLIENT_SECRET: "pix-secret",
      EFI_CARD_CLIENT_ID: "sandbox-card-client",
      EFI_CARD_CLIENT_SECRET: "sandbox-card-secret",
      EFI_CARD_PRODUCTION_NOTIFICATION_URL: "https://starcarvalho.vercel.app/api/internal/efi-card-notification",
    } as unknown as NodeJS.ProcessEnv),
    /EFI_CARD_PRODUCTION_CREDENTIALS_MISSING/,
  );
});

test("Production readiness requires HTTPS notification URL and remains disabled when incomplete", () => {
  assert.equal(isEfiCreditCardProductionConfigured({} as NodeJS.ProcessEnv), false);
  assert.throws(
    () => resolveEfiCreditCardProductionConfig({ ...production, EFI_CARD_PRODUCTION_NOTIFICATION_URL: "http://example.test/hook" }),
    /EFI_CARD_PRODUCTION_NOTIFICATION_URL_INVALID/,
  );
  assert.equal(isEfiCreditCardProductionConfigured(production), true);
});
