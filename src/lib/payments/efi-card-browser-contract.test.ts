import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../../components/efi-card-payment-panel.tsx", import.meta.url), "utf8");

test("Efí card tokenization is constrained to a client-only panel", () => {
  assert.match(panel, /^"use client";/);
  assert.match(panel, /import EfiPay from "payment-token-efi"/);
  assert.match(panel, /\.setEnvironment\("sandbox"\)/);
  assert.match(panel, /\.setCardNumber\(cardNumber\)\.verifyCardBrand\(\)/);
  assert.match(panel, /reuse: false/);
});

test("Efí card sends only its ephemeral token and payer contract to the backend", () => {
  assert.match(panel, /fetch\("\/api\/payments\/efi-card"/);
  assert.match(panel, /paymentToken: tokenResult\.payment_token/);
  assert.doesNotMatch(panel, /body: JSON\.stringify\([^)]*number/);
  assert.doesNotMatch(panel, /body: JSON\.stringify\([^)]*cvv/);
  assert.match(panel, /setNumber\(""\);/);
  assert.match(panel, /setCvv\(""\);/);
});
