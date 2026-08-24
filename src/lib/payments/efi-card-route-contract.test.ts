import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../../app/api/payments/efi-card/route.ts", import.meta.url), "utf8");

test("Efí card route accepts only the browser-token contract", () => {
  assert.match(route, /new Set\(\["sessionId", "paymentToken", "payer"\]\)/);
  for (const field of ["amount", "paymentId", "provider", "cardNumber", "pan", "number", "cvv", "securityCode", "customId", "notificationUrl"]) {
    assert.match(route, new RegExp(`"${field}"`));
  }
  assert.match(route, /typeof body\.paymentToken !== "string"/);
  assert.match(route, /PAYMENT_FORBIDDEN/);
});

test("Efí card route does not return or persist the browser token", () => {
  assert.doesNotMatch(route, /Response\.json\([^\n]*paymentToken/);
  assert.doesNotMatch(route, /payment_token/);
  assert.match(route, /new EfiCardService\(\)\.createPayment\(paymentId, body\.paymentToken, payer\)/);
});

test("Efí card route returns only sanitized provider diagnostics", () => {
  assert.match(route, /cause instanceof EfiCardProviderError/);
  assert.match(route, /error: cause\.publicCode/);
  assert.match(route, /stage: cause\.stage/);
  assert.match(route, /uncertain: cause\.uncertain/);
  assert.doesNotMatch(route, /Response\.json\([^\n]*providerCode/);
  assert.doesNotMatch(route, /Response\.json\([^\n]*paymentToken/);
});
