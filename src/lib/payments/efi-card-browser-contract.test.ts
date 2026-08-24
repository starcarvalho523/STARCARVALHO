import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../../components/efi-card-payment-panel.tsx", import.meta.url), "utf8");

test("Efí card tokenization is constrained to a client-only panel", () => {
  assert.match(panel, /^"use client";/);
  assert.doesNotMatch(panel, /^import EfiPay from "payment-token-efi"/m);
  assert.match(panel, /await import\("payment-token-efi"\)/);
  assert.match(panel, /\.setEnvironment\("sandbox"\)/);
  assert.match(panel, /\.setCardNumber\([^)]*cardNumber[^)]*\)\.verifyCardBrand\(\)/);
  assert.match(panel, /reuse: false/);
  assert.match(panel, /isScriptBlocked\(\)/);
});

test("Efí card sends only its ephemeral token, payer and non-sensitive card metadata", () => {
  assert.match(panel, /fetch\("\/api\/payments\/efi-card"/);
  assert.match(panel, /paymentToken: tokenResult\.payment_token/);
  assert.match(panel, /cardMeta:\s*\{\s*brand:\s*String\(brand\),\s*last4:\s*[^,}\n]*cardNumber\.slice\(-4\)\s*\}/);
  assert.doesNotMatch(panel, /cardMeta:\s*\{[^}]*\bnumber\s*:/);
  assert.doesNotMatch(panel, /cardMeta:\s*\{[^}]*\bcvv\s*:/);
  assert.match(panel, /setNumber\(""\);/);
  assert.match(panel, /setCvv\(""\);/);
});

test("temporary sanitized browser-stage diagnostics are not shipped", () => {
  assert.doesNotMatch(panel, /Etapa segura:/);
  assert.doesNotMatch(panel, /BrowserStage/);
  assert.doesNotMatch(panel, /browserStage/);
  assert.doesNotMatch(panel, /browserCode/);
});
