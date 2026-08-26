import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../../app/api/payments/efi-card/route.ts", import.meta.url), "utf8");

test("Efí card route accepts only the browser-token plus safe metadata contract", () => {
  assert.match(route, /new Set\(\["sessionId", "paymentToken", "payer", "cardMeta"\]\)/);
  for (const field of ["amount", "paymentId", "provider", "cardNumber", "pan", "number", "cvv", "securityCode", "customId", "notificationUrl"]) {
    assert.match(route, new RegExp(`"${field}"`));
  }
  assert.match(route, /typeof body\.paymentToken !== "string"/);
  assert.match(route, /cardMetaFrom\(body\.cardMeta\)/);
  assert.ok(route.includes("!/^\\d{4}$/.test(last4)"));
  assert.match(route, /PAYMENT_FORBIDDEN/);
});

test("Efí card route does not return or persist the browser token", () => {
  assert.doesNotMatch(route, /Response\.json\([^\n]*paymentToken/);
  assert.doesNotMatch(route, /payment_token/);
  assert.match(route, /new EfiCardService\(undefined, environment\)\.createPayment\(paymentId, body\.paymentToken, payer, cardMeta\)/);
});

test("Efí card route uses the actor-aware reservation wrapper", () => {
  assert.match(route, /createAdminClient\(\)/);
  assert.match(route, /get_or_reserve_efi_card_payment_for_actor/);
  assert.match(route, /target_actor: actor\.id/);
  assert.match(route, /target_environment: environment/);
});

test("Efí card route returns only sanitized provider diagnostics", () => {
  assert.match(route, /cause instanceof EfiCardProviderError/);
  assert.match(route, /error: cause\.publicCode/);
  assert.match(route, /stage: cause\.stage/);
  assert.match(route, /uncertain: cause\.uncertain/);
  assert.doesNotMatch(route, /Response\.json\([^\n]*providerCode/);
  assert.doesNotMatch(route, /Response\.json\([^\n]*paymentToken/);
});
