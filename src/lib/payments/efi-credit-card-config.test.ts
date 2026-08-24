import assert from "node:assert/strict";
import test from "node:test";
import { resolveEfiCreditCardConfig } from "./efi-credit-card-config.ts";

const sandbox = {
  EFI_ENABLED: "true",
  EFI_CARD_ENVIRONMENT: "sandbox",
  EFI_CARD_CLIENT_ID: "card-client",
  EFI_CARD_CLIENT_SECRET: "card-secret",
  EFI_CARD_NOTIFICATION_URL: "https://example.test/api/internal/efi-card-notification",
} as unknown as NodeJS.ProcessEnv;

test("Efí card stays disabled without explicit enablement", () => {
  assert.throws(() => resolveEfiCreditCardConfig({} as NodeJS.ProcessEnv), /EFI_DISABLED/);
});

test("Efí card blocks production and does not reuse Pix environment", () => {
  assert.throws(() => resolveEfiCreditCardConfig({ ...sandbox, EFI_CARD_ENVIRONMENT: "production" }), /EFI_CARD_PRODUCTION_DISABLED/);
  assert.throws(
    () => resolveEfiCreditCardConfig({ ...sandbox, EFI_CARD_ENVIRONMENT: "", EFI_ENVIRONMENT: "sandbox" }),
    /EFI_CARD_PRODUCTION_DISABLED/,
  );
});

test("Efí card requires server-side credentials", () => {
  assert.throws(() => resolveEfiCreditCardConfig({ ...sandbox, EFI_CARD_CLIENT_ID: "" }), /EFI_CARD_CREDENTIALS_MISSING/);
  assert.throws(() => resolveEfiCreditCardConfig({ ...sandbox, EFI_CARD_CLIENT_SECRET: "" }), /EFI_CARD_CREDENTIALS_MISSING/);
  assert.throws(
    () => resolveEfiCreditCardConfig({ ...sandbox, EFI_CARD_CLIENT_ID: "", EFI_CLIENT_ID: "pix-client", EFI_CLIENT_SECRET: "pix-secret" }),
    /EFI_CARD_CREDENTIALS_MISSING/,
  );
});

test("Efí card requires an HTTPS notification URL", () => {
  assert.throws(() => resolveEfiCreditCardConfig({ ...sandbox, EFI_CARD_NOTIFICATION_URL: "" }), /EFI_CARD_NOTIFICATION_URL_MISSING/);
  assert.throws(() => resolveEfiCreditCardConfig({ ...sandbox, EFI_CARD_NOTIFICATION_URL: "not-a-url" }), /EFI_CARD_NOTIFICATION_URL_INVALID/);
  assert.throws(() => resolveEfiCreditCardConfig({ ...sandbox, EFI_CARD_NOTIFICATION_URL: "http://example.test/hook" }), /EFI_CARD_NOTIFICATION_URL_INVALID/);
});

test("Efí card resolves only the fixed sandbox billing origin", () => {
  const config = resolveEfiCreditCardConfig(sandbox);
  assert.equal(config.baseUrl, "https://cobrancas-h.api.efipay.com.br");
  assert.equal(config.notificationUrl, "https://example.test/api/internal/efi-card-notification");
});
