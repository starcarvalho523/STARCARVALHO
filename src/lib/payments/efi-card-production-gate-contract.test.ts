import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const availability = readFileSync(new URL("./payment-availability.ts", import.meta.url), "utf8");
const paymentRoute = readFileSync(new URL("../../app/api/payments/efi-card/route.ts", import.meta.url), "utf8");
const notificationRoute = readFileSync(new URL("../../app/api/internal/efi-card-notification/route.ts", import.meta.url), "utf8");
const supabaseEnv = readFileSync(new URL("../supabase/env.ts", import.meta.url), "utf8");

test("Efí card customer availability is restricted to the authorized QA preview runtime", () => {
  assert.match(availability, /isEfiCardQaPreviewRuntime/);
  assert.match(availability, /efiCard:isEfiCardQaPreviewRuntime\(\)&&canUsePayment\(capabilities,"CREDIT_CARD","TOKENIZED_CHECKOUT","EFI"\)/);
  assert.match(availability, /provider==="EFI"&&channel==="TOKENIZED_CHECKOUT"\)return isEfiCardQaPreviewRuntime\(\)&&isEfiCreditCardConfigured\(\)/);
});

test("Efí card payment route fails closed before reading payment input outside QA preview", () => {
  const gate = paymentRoute.indexOf("if (!isEfiCardQaPreviewRuntime())");
  const body = paymentRoute.indexOf("request.json()");
  assert.ok(gate >= 0 && body > gate);
  assert.match(paymentRoute, /EFI_CARD_NOT_AVAILABLE/);
});

test("Efí card notification route allows only QA or the explicit Production runtime gate", () => {
  const qaGate = notificationRoute.indexOf("isEfiCardQaPreviewRuntime()");
  const productionGate = notificationRoute.indexOf("isEfiCardProductionRuntimeEnabled()");
  const failClosed = notificationRoute.indexOf("if (!isQa && !isProduction)");
  const form = notificationRoute.indexOf("request.formData()");

  assert.ok(qaGate >= 0 && productionGate >= 0 && failClosed >= 0 && form > failClosed);
  assert.match(notificationRoute, /EFI_CARD_NOTIFICATION_NOT_AVAILABLE/);
  assert.match(notificationRoute, /isProduction \? "PRODUCTION" : "SANDBOX"/);
  assert.match(notificationRoute, /new EfiCardService\(undefined, environment\)/);
});

test("QA gate is pinned to Vercel Preview and the dedicated Sandbox branch", () => {
  assert.match(supabaseEnv, /VERCEL_ENV === "preview"/);
  assert.match(supabaseEnv, /EFI_CARD_QA_PREVIEW_BRANCH = "feat\/efi-credit-card-sandbox"/);
  assert.match(supabaseEnv, /VERCEL_GIT_COMMIT_REF === EFI_CARD_QA_PREVIEW_BRANCH/);
});

test("Production gate requires Vercel Production, main and an explicit opt-in flag", () => {
  assert.match(supabaseEnv, /EFI_CARD_PRODUCTION_BRANCH = "main"/);
  assert.match(supabaseEnv, /environment\.VERCEL_ENV === "production"/);
  assert.match(supabaseEnv, /environment\.VERCEL_GIT_COMMIT_REF === EFI_CARD_PRODUCTION_BRANCH/);
  assert.match(supabaseEnv, /environment\.EFI_CARD_PRODUCTION_ENABLED === "true"/);
});

test("Production remains unavailable to customers until later activation", () => {
  assert.doesNotMatch(availability, /isEfiCardProductionRuntimeEnabled/);
  assert.doesNotMatch(paymentRoute, /isEfiCardProductionRuntimeEnabled/);
  assert.match(notificationRoute, /isEfiCardProductionRuntimeEnabled/);
});
