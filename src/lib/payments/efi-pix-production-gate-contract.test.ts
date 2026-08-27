import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const createRoute = readFileSync(new URL("../../app/api/payments/efi-pix/route.ts", import.meta.url), "utf8");
const reconcileRoute = readFileSync(new URL("../../app/api/payments/efi-pix/reconcile/route.ts", import.meta.url), "utf8");
const availability = readFileSync(new URL("./payment-availability.ts", import.meta.url), "utf8");
const supabaseEnv = readFileSync(new URL("../supabase/env.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../supabase/migrations/20260827004500_efi_pix_production_readiness.sql", import.meta.url), "utf8");
const capability = readFileSync(new URL("../../../supabase/migrations/20260827004600_efi_pix_disabled_capability.sql", import.meta.url), "utf8");

test("Efí Pix Production runtime requires Vercel Production, main and explicit enablement", () => {
  assert.match(supabaseEnv, /EFI_PIX_PRODUCTION_BRANCH = "main"/);
  assert.match(supabaseEnv, /environment\.VERCEL_ENV === "production"/);
  assert.match(supabaseEnv, /environment\.VERCEL_GIT_COMMIT_REF === EFI_PIX_PRODUCTION_BRANCH/);
  assert.match(supabaseEnv, /environment\.EFI_PIX_PRODUCTION_ENABLED === "true"/);
});

test("Efí Pix create route fails closed before reserving a Production payment", () => {
  const config = createRoute.indexOf("resolveEfiPixRuntimeConfig()");
  const runtime = createRoute.indexOf("isEfiPixProductionRuntimeEnabled()");
  const reserve = createRoute.indexOf("get_or_reserve_efi_pix_payment_for_actor");
  assert.ok(config >= 0 && runtime > config && reserve > runtime);
  assert.match(createRoute, /target_actor: auth\.user\.id/);
  assert.match(createRoute, /target_environment: providerEnvironment/);
  assert.match(createRoute, /EFI_PIX_NOT_AVAILABLE/);
});

test("Efí Pix reconciliation is scoped to the configured provider environment", () => {
  assert.match(reconcileRoute, /resolveEfiPixRuntimeConfig\(\)/);
  assert.match(reconcileRoute, /isEfiPixProductionRuntimeEnabled\(\)/);
  assert.match(reconcileRoute, /get_efi_pix_payment_for_session_for_environment/);
  assert.match(reconcileRoute, /target_environment: providerEnvironment/);
});

test("Efí Pix Production availability also fails closed outside the Production runtime", () => {
  assert.match(availability, /provider==="EFI"&&channel==="QR"/);
  assert.match(availability, /isEfiPixProductionRuntimeEnabled\(\)/);
  assert.match(availability, /isEfiConfigured\(\)&&\(!production\|\|isEfiPixProductionRuntimeEnabled\(\)\)/);
});

test("Efí Pix database reservation persists the selected environment instead of hard-coding Sandbox", () => {
  assert.match(migration, /target_environment not in \('SANDBOX','PRODUCTION'\)/);
  assert.match(migration, /provider_environment=target_environment/);
  assert.match(migration, /target_environment,'QR','PENDING'/);
});

test("Efí Pix settlement uses the standard payment-subject transition", () => {
  assert.match(migration, /perform private\.mark_payment_subject_paid\(payment\.id,true\)/);
  assert.match(migration, /provider_status='CONCLUIDA'/);
});

test("Efí Pix Production capability is provisioned disabled and unconfigured", () => {
  assert.match(capability, /'PIX','QR','EFI',false,'UNCONFIGURED',false/);
  assert.match(capability, /on conflict .* do nothing/i);
});
